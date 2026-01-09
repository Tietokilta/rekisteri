# Playwright Testing Guide

This guide provides comprehensive documentation for writing end-to-end tests with Playwright in the rekisteri project. Following these best practices ensures robust, maintainable, and parallelizable tests.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Architecture](#test-architecture)
3. [Best Practices](#best-practices)
4. [Selectors Strategy](#selectors-strategy)
5. [Authentication Fixtures](#authentication-fixtures)
6. [Database Access in Tests](#database-access-in-tests)
7. [Parallel Test Execution](#parallel-test-execution)
8. [Setup and Teardown](#setup-and-teardown)
9. [Common Patterns](#common-patterns)
10. [Playwright MCP Integration](#playwright-mcp-integration)
11. [Debugging and Troubleshooting](#debugging-and-troubleshooting)

---

## Quick Start

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in UI mode (interactive)
pnpm exec playwright test --ui

# Run tests with headed browser
pnpm exec playwright test --headed

# Run specific test file
pnpm exec playwright test e2e/auth.test.ts

# Run tests matching a pattern
pnpm exec playwright test -g "should verify OTP"

# Debug mode (opens inspector)
pnpm exec playwright test --debug
```

### Creating a New Test File

```typescript
import { test, expect } from "./fixtures/auth";

test.describe("Feature Name", () => {
	test("should do something", async ({ adminPage }) => {
		await adminPage.goto("/fi/your-route");

		// Your test logic
		await expect(adminPage.getByTestId("some-element")).toBeVisible();
	});
});
```

---

## Test Architecture

### Directory Structure

```
e2e/
├── .auth/                    # Generated auth state files
│   ├── admin.json           # Admin session storage
│   └── admin-user.json      # Admin user info
├── fixtures/
│   └── auth.ts              # Custom authentication fixtures
├── global-setup.ts          # Global test setup (DB, auth)
├── utils.ts                 # Shared utility functions
├── auth.test.ts             # Authentication tests
├── secondary-emails.test.ts # Feature-specific tests
└── csv-import.test.ts       # More feature tests
```

### Test Configuration

Configuration is defined in `playwright.config.ts`:

- **Test directory**: `e2e/`
- **Base URL**: `http://localhost:4173`
- **Locale**: Finnish (`fi-FI`)
- **Timezone**: `Europe/Helsinki`
- **Database**: Isolated test database (`DATABASE_URL_TEST`)

### Global Setup

The `global-setup.ts` file runs **once** before all tests:

1. Creates/validates test database
2. Pushes schema to test database
3. Seeds with initial data (admin user)
4. Creates authenticated admin session
5. Saves session storage state to `e2e/.auth/admin.json`

This allows tests to start authenticated without repeating login flows.

---

## Best Practices

### 1. Test Isolation

**Each test MUST be completely isolated** - tests should not depend on each other or share state.

#### ✅ Good: Isolated test

```typescript
test("should add secondary email", async ({ adminPage }, testInfo) => {
	// Generate unique email for this test worker
	const email = `test-w${testInfo.workerIndex}-${Date.now()}@example.com`;

	await adminPage.goto("/fi/secondary-emails/add");
	await adminPage.fill('input[type="email"]', email);
	await adminPage.getByTestId("submit-add-email").click();

	await expect(adminPage).toHaveURL(/secondary-emails\/verify/);
});
```

#### ❌ Bad: Shared state between tests

```typescript
// DON'T DO THIS
let sharedEmail: string;

test("should create email", async ({ adminPage }) => {
	sharedEmail = "shared@example.com";  // ❌ Bad
	// ...
});

test("should verify email", async ({ adminPage }) => {
	// This depends on the previous test ❌
	await verifyEmail(sharedEmail);
});
```

### 2. Use Worker-Scoped Data

For parallel execution, use **worker-scoped unique identifiers**:

```typescript
const getTestEmail = (prefix: string, workerIndex: number) =>
	`${prefix}-w${workerIndex}-${Date.now()}@example.com`;

test("my test", async ({ adminPage }, testInfo) => {
	const email = getTestEmail("test", testInfo.workerIndex);
	// Use this unique email in test
});
```

### 3. Clean Up Test Data

Use `beforeEach` to clean worker-specific data:

```typescript
test.beforeEach(async ({}, testInfo) => {
	// Clean up worker-specific emails for parallel test isolation
	const workerPattern = `%-w${testInfo.workerIndex}-%`;
	await db.delete(table.emailOTP).where(like(table.emailOTP.email, workerPattern));
	await db.delete(table.secondaryEmail).where(like(table.secondaryEmail.email, workerPattern));
});
```

### 4. Wait for Navigation Explicitly

Always wait for navigation to complete:

```typescript
// ✅ Good: Explicit wait
await page.getByTestId("submit-button").click();
await page.waitForURL(/expected-route/);

// ❌ Bad: Race condition possible
await page.getByTestId("submit-button").click();
await expect(page.getByTestId("success")).toBeVisible();
```

### 5. Use Appropriate Wait Strategies

```typescript
// Wait for element state
await page.getByTestId("submit-button").waitFor({ state: "visible" });

// Wait for network idle (use sparingly, prefer specific conditions)
await page.goto("/fi/admin/members", { waitUntil: "networkidle" });

// Wait for specific condition
await expect(page.getByTestId("loading")).toBeHidden();
```

---

## Selectors Strategy

Use selectors in this priority order:

### 1. Test IDs (Highest Priority)

Use `data-testid` attributes for elements that need to be tested:

```typescript
// In Svelte component:
<button data-testid="submit-add-email">Add Email</button>

// In test:
await page.getByTestId("submit-add-email").click();
```

**When to add test IDs:**
- Critical user actions (submit buttons, primary navigation)
- Elements that might change text/structure
- Elements without stable semantic roles

### 2. Semantic Roles (Preferred)

Use built-in accessibility roles when available:

```typescript
await page.getByRole("button", { name: /sign in/i }).click();
await page.getByRole("heading", { name: "Admin Panel" }).waitFor();
```

### 3. Component Data Slots

For shadcn-svelte components, use `data-slot` attributes:

```typescript
// List items
const emailRow = page.locator('[data-slot="item"]').filter({ hasText: email });

// Input OTP
await page.locator('[data-slot="input-otp"]').pressSequentially(code);
```

### 4. Text Content (Use Carefully)

```typescript
// Use case-insensitive regex for i18n
await page.getByText(/kirjaudu|sign in/i).click();
```

### 5. CSS Selectors (Last Resort)

```typescript
// Only when no better option exists
await page.locator('input[type="email"]').fill(email);
```

### ❌ Avoid These Selectors

```typescript
// DON'T use brittle selectors
await page.locator(".css-class-name");  // ❌ Classes change
await page.locator("div > div > button");  // ❌ Structure changes
await page.locator("xpath=//button[1]");  // ❌ Position-based
```

---

## Authentication Fixtures

The project provides custom fixtures for authenticated testing.

### Available Fixtures

#### 1. `adminPage`

Pre-authenticated page with admin user session:

```typescript
import { test, expect } from "./fixtures/auth";

test("admin-only feature", async ({ adminPage }) => {
	await adminPage.goto("/fi/admin/members");

	// Already authenticated as root@tietokilta.fi
	await expect(adminPage).toHaveURL(/admin\/members/);
});
```

#### 2. `authenticatedPage`

Pre-authenticated page (currently uses admin, can be extended for regular users):

```typescript
test("user feature", async ({ authenticatedPage }) => {
	await authenticatedPage.goto("/fi/");
	// Authenticated but may not have admin privileges
});
```

#### 3. `adminUser`

Access to admin user information:

```typescript
test("uses admin user info", async ({ adminPage, adminUser }) => {
	console.log(adminUser.id);      // User ID
	console.log(adminUser.email);   // root@tietokilta.fi
	console.log(adminUser.isAdmin); // true
});
```

### Testing Unauthenticated Flows

For testing authentication flows, use the default `page` fixture:

```typescript
import { test as base, expect } from "@playwright/test";

test("sign-in flow", async ({ page }) => {
	await page.goto("/fi/sign-in");

	await page.fill('input[type="email"]', "user@example.com");
	await page.getByRole("button", { name: /kirjaudu|sign in/i }).click();

	// Continue with OTP flow...
});
```

Or create new browser context:

```typescript
test("multi-user scenario", async ({ adminPage, browser }) => {
	// Create second user context
	const victimContext = await browser.newContext();
	const victimPage = await victimContext.newPage();

	try {
		await victimPage.goto("/fi/sign-in");
		// Test as different user
	} finally {
		await victimContext.close();
	}
});
```

---

## Database Access in Tests

Tests can directly access the database for setup, verification, and cleanup.

### Setting Up Database Connection

```typescript
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";

test.describe("Feature Tests", () => {
	let client: ReturnType<typeof postgres>;
	let db: ReturnType<typeof drizzle>;

	test.beforeAll(async () => {
		const dbUrl = process.env.DATABASE_URL_TEST;
		if (!dbUrl) throw new Error("DATABASE_URL_TEST not set");

		client = postgres(dbUrl);
		db = drizzle(client, { schema: table, casing: "snake_case" });
	});

	test.afterAll(async () => {
		await client.end();
	});
});
```

### Common Database Patterns

#### Verify Data Creation

```typescript
test("should create record", async ({ adminPage }) => {
	await adminPage.goto("/fi/feature/create");
	await adminPage.fill('input[name="email"]', "test@example.com");
	await adminPage.getByTestId("submit").click();

	// Verify in database
	const [record] = await db
		.select()
		.from(table.someTable)
		.where(eq(table.someTable.email, "test@example.com"));

	expect(record).toBeDefined();
	expect(record?.status).toBe("active");
});
```

#### Retrieve Test Data

```typescript
test("should process OTP", async ({ adminPage }) => {
	const email = "test@example.com";

	// Trigger OTP send
	await adminPage.goto("/fi/sign-in");
	await adminPage.fill('input[type="email"]', email);
	await adminPage.getByRole("button", { name: /send/i }).click();

	// Retrieve OTP from database
	const [otp] = await db
		.select()
		.from(table.emailOTP)
		.where(eq(table.emailOTP.email, email.toLowerCase()));

	expect(otp?.code).toMatch(/^[A-Z2-7]{8}$/);

	// Use OTP in test
	await adminPage.locator('[data-slot="input-otp"]').pressSequentially(otp.code);
});
```

#### Clean Up Test Data

```typescript
test.beforeEach(async ({}, testInfo) => {
	// Delete test data before each test
	const workerPattern = `%-w${testInfo.workerIndex}-%`;
	await db.delete(table.testData).where(like(table.testData.email, workerPattern));
});
```

---

## Parallel Test Execution

Playwright runs tests in **parallel by default** for faster execution.

### How Parallelization Works

- Tests within a file run **sequentially**
- Different test files run in **parallel workers**
- Each worker gets its own browser instance
- `testInfo.workerIndex` identifies the worker (0, 1, 2, etc.)

### Writing Parallel-Safe Tests

#### Use Worker Index for Unique Data

```typescript
// ✅ Good: Worker-scoped unique data
test("my test", async ({ adminPage }, testInfo) => {
	const email = `test-w${testInfo.workerIndex}-${Date.now()}@example.com`;
	// Safe for parallel execution
});

// ❌ Bad: Same data across workers
test("my test", async ({ adminPage }) => {
	const email = "test@example.com";  // ❌ Collision across workers
});
```

#### Clean Worker-Scoped Data

```typescript
test.beforeEach(async ({}, testInfo) => {
	// Clean only this worker's data
	const pattern = `%-w${testInfo.workerIndex}-%`;
	await db.delete(table.data).where(like(table.data.identifier, pattern));
});
```

### Controlling Parallelization

```bash
# Run with 4 workers
pnpm exec playwright test --workers=4

# Run serially (one at a time)
pnpm exec playwright test --workers=1

# Run fully parallel (one worker per test)
pnpm exec playwright test --fully-parallel
```

### Serial Tests (When Needed)

If tests **must** run sequentially:

```typescript
test.describe.serial("Serial Tests", () => {
	test("step 1", async ({ page }) => { /* ... */ });
	test("step 2", async ({ page }) => { /* ... */ });
	// These run in order
});
```

**Use serial tests sparingly** - they slow down execution.

---

## Setup and Teardown

### Global Setup/Teardown

**`global-setup.ts`**: Runs once before all tests

```typescript
async function globalSetup(config: FullConfig) {
	// Create test database
	// Seed initial data
	// Create auth state
}

export default globalSetup;
```

**`global-teardown.ts`**: Runs once after all tests (optional)

```typescript
async function globalTeardown(config: FullConfig) {
	// Clean up resources
}

export default globalTeardown;
```

### Per-Suite Hooks

```typescript
test.describe("Feature Tests", () => {
	test.beforeAll(async () => {
		// Runs once before all tests in this suite
		// Example: Setup database connection
	});

	test.afterAll(async () => {
		// Runs once after all tests in this suite
		// Example: Close database connection
	});

	test.beforeEach(async ({ page }) => {
		// Runs before each test
		// Example: Navigate to starting page, clean test data
	});

	test.afterEach(async ({ page }) => {
		// Runs after each test
		// Example: Clean up UI state
	});
});
```

### Hook Order

```
globalSetup()
  beforeAll()
    beforeEach()
      test 1
    afterEach()
    beforeEach()
      test 2
    afterEach()
  afterAll()
globalTeardown()
```

### Best Practices

1. **Database connections**: Setup in `beforeAll`, close in `afterAll`
2. **Test data cleanup**: Use `beforeEach` for fresh state per test
3. **Shared expensive operations**: Use `beforeAll` (e.g., seeding large datasets)
4. **Cleanup**: Prefer `beforeEach` over `afterEach` (ensures clean state even if test fails)

---

## Common Patterns

### Pattern 1: Fill Form and Submit

```typescript
test("should submit form", async ({ adminPage }) => {
	await adminPage.goto("/fi/form-page");

	// Fill form fields
	await adminPage.fill('input[name="firstName"]', "John");
	await adminPage.fill('input[name="lastName"]', "Doe");
	await adminPage.fill('input[type="email"]', "john@example.com");

	// Submit and wait for navigation
	await adminPage.getByTestId("submit-form").click();
	await adminPage.waitForURL(/success/);

	// Verify result
	await expect(adminPage.getByText("Success")).toBeVisible();
});
```

### Pattern 2: Handle OTP Flow

```typescript
test("should verify OTP", async ({ adminPage }) => {
	const email = `test-${Date.now()}@example.com`;

	// Trigger OTP
	await adminPage.goto("/fi/verify");
	await adminPage.fill('input[type="email"]', email);
	await adminPage.getByTestId("send-code").click();
	await adminPage.waitForURL(/enter-code/);

	// Retrieve OTP from database
	const [otp] = await db
		.select()
		.from(table.emailOTP)
		.where(eq(table.emailOTP.email, email.toLowerCase()));

	if (!otp) throw new Error("OTP not found");

	// Enter OTP
	await adminPage.locator('[data-slot="input-otp"]').pressSequentially(otp.code);

	// Verify success
	await adminPage.waitForURL(/success/);
});
```

### Pattern 3: Handle Dialogs

```typescript
test("should handle confirmation dialog", async ({ adminPage }) => {
	// Setup dialog handler BEFORE triggering action
	adminPage.on("dialog", (dialog) => dialog.accept());

	// Or check dialog message
	adminPage.on("dialog", async (dialog) => {
		expect(dialog.message()).toContain("Are you sure?");
		await dialog.accept();
	});

	await adminPage.getByTestId("delete-button").click();

	// Dialog is automatically handled
	await expect(adminPage.getByTestId("item")).toBeHidden();
});
```

### Pattern 4: Multi-User Scenarios

```typescript
test("should handle multi-user interaction", async ({ adminPage, browser }) => {
	// Admin user does something
	await adminPage.goto("/fi/admin/feature");
	await adminPage.getByTestId("create-item").click();

	// Create second user context
	const userContext = await browser.newContext();
	const userPage = await userContext.newPage();

	try {
		// Second user sees the change
		await userPage.goto("/fi/items");
		await expect(userPage.getByTestId("new-item")).toBeVisible();
	} finally {
		await userContext.close();
	}
});
```

### Pattern 5: Reusable Helper Functions

```typescript
// Define helpers at top of test file
const getItemRow = (page: Page, itemId: string) => {
	return page.locator('[data-slot="item"]').filter({ hasText: itemId });
};

const createItem = async (page: Page, name: string) => {
	await page.goto("/fi/items/create");
	await page.fill('input[name="name"]', name);
	await page.getByTestId("submit").click();
	await page.waitForURL(/items$/);
};

// Use in tests
test("should create and delete item", async ({ adminPage }) => {
	const itemName = `test-${Date.now()}`;

	await createItem(adminPage, itemName);

	const row = getItemRow(adminPage, itemName);
	await expect(row).toBeVisible();

	await row.getByRole("button", { name: /delete/i }).click();
	await expect(row).toBeHidden();
});
```

### Pattern 6: Testing Internationalization

```typescript
test("should work in Finnish", async ({ adminPage }) => {
	await adminPage.goto("/fi/admin/members");
	await expect(adminPage.getByRole("heading", { name: /jäsenet/i })).toBeVisible();
});

test("should work in English", async ({ adminPage }) => {
	await adminPage.goto("/en/admin/members");
	await expect(adminPage.getByRole("heading", { name: /members/i })).toBeVisible();
});

// Or use regex for both
test("should show heading in any language", async ({ adminPage }) => {
	await adminPage.goto("/fi/admin/members");
	await expect(adminPage.getByRole("heading", { name: /jäsenet|members/i })).toBeVisible();
});
```

---

## Playwright MCP Integration

The project can integrate with Model Context Protocol (MCP) servers for enhanced Playwright functionality.

### Installing Playwright MCP Server

Install the official Playwright MCP server:

```bash
# Using npx (no installation)
npx @executeautomation/playwright-mcp-server

# Or install globally
npm install -g @executeautomation/playwright-mcp-server
```

### Configuring MCP for Claude Code

Add to your MCP settings (`.claude/mcp.json` or similar):

```json
{
	"mcpServers": {
		"playwright": {
			"command": "npx",
			"args": ["-y", "@executeautomation/playwright-mcp-server"],
			"env": {
				"PLAYWRIGHT_PROJECT": "/home/user/rekisteri"
			}
		}
	}
}
```

### Available MCP Tools

When configured, Claude Code can use these Playwright tools:

1. **navigate** - Navigate to URL
2. **screenshot** - Take screenshots
3. **click** - Click elements
4. **fill** - Fill form inputs
5. **playwright_select** - Select from dropdowns
6. **playwright_evaluate** - Execute JavaScript
7. **playwright_getByTestId** - Find by test ID
8. **playwright_getByRole** - Find by ARIA role

### Using MCP in Development

When MCP is configured, you can ask Claude Code to:

- Generate test cases by navigating the app
- Take screenshots for visual regression
- Inspect element selectors
- Validate accessibility attributes

Example workflow:

```
User: "Navigate to /fi/admin/members and take a screenshot"

Claude Code: [Uses MCP to navigate and screenshot]
         "Here's the current state of the admin members page"
```

### Benefits of MCP Integration

- **Interactive test development**: Explore app while writing tests
- **Visual validation**: Screenshots for reference
- **Selector discovery**: Find robust selectors easily
- **Accessibility checking**: Verify ARIA roles and attributes

---

## Debugging and Troubleshooting

### UI Mode (Interactive Debugging)

The best way to debug tests:

```bash
pnpm exec playwright test --ui
```

Features:
- Watch tests run in real-time
- Time-travel through test steps
- Inspect DOM at each step
- Edit and re-run tests
- View console logs and network requests

### Debug Mode

Step through tests with Playwright Inspector:

```bash
# Debug all tests
pnpm exec playwright test --debug

# Debug specific test
pnpm exec playwright test auth.test.ts --debug

# Debug tests matching pattern
pnpm exec playwright test --debug -g "should verify OTP"
```

### Headed Mode

Run tests with visible browser:

```bash
pnpm exec playwright test --headed

# Slow down execution for visibility
pnpm exec playwright test --headed --slow-mo=1000
```

### Screenshots on Failure

Playwright automatically captures screenshots on failure. Find them in:

```
test-results/
  <test-name>/
    test-failed-1.png
```

### Trace Viewer

Enable trace recording for post-mortem debugging:

```typescript
// In playwright.config.ts
export default defineConfig({
	use: {
		trace: "on-first-retry",  // or 'on', 'retain-on-failure'
	},
});
```

View traces:

```bash
pnpm exec playwright show-trace test-results/<test-name>/trace.zip
```

### Common Issues

#### Issue: Test Timeouts

```typescript
// Increase timeout for slow operations
test("slow operation", async ({ adminPage }) => {
	test.setTimeout(60000);  // 60 seconds

	await adminPage.goto("/fi/slow-page");
	await adminPage.getByTestId("slow-button").click({ timeout: 30000 });
});
```

#### Issue: Flaky Tests

```typescript
// ❌ Bad: Race condition
await page.click("button");
await expect(page.getByTestId("result")).toBeVisible();

// ✅ Good: Wait for navigation/state
await page.click("button");
await page.waitForURL(/success/);
await expect(page.getByTestId("result")).toBeVisible();
```

#### Issue: Stale Element

```typescript
// ❌ Bad: Element reference can become stale
const button = page.getByTestId("submit");
await page.fill("input", "value");
await button.click();  // May be stale

// ✅ Good: Get fresh reference
await page.fill("input", "value");
await page.getByTestId("submit").click();
```

#### Issue: i18n Route Matching

```typescript
// ❌ Bad: Hard-coded locale
await expect(page).toHaveURL("/fi/admin/members");

// ✅ Good: Match any locale
await expect(page).toHaveURL(/\/(fi|en)\/(hallinta\/jasenet|admin\/members)/);
```

### Logging and Diagnostics

```typescript
test("debug test", async ({ adminPage }) => {
	// Log page title
	console.log(await adminPage.title());

	// Log element count
	const items = adminPage.getByTestId("item");
	console.log(`Found ${await items.count()} items`);

	// Log element text
	const heading = adminPage.getByRole("heading").first();
	console.log(await heading.textContent());

	// Pause execution (opens inspector)
	await adminPage.pause();
});
```

### VSCode Integration

Install the Playwright VSCode extension for:

- Run/debug tests from editor
- Set breakpoints in tests
- View test results inline
- Record new tests

```bash
code --install-extension ms-playwright.playwright
```

---

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Selectors Guide](https://playwright.dev/docs/selectors)
- [Playwright Fixtures](https://playwright.dev/docs/test-fixtures)
- [Playwright Parallelism](https://playwright.dev/docs/test-parallel)

---

## Summary

**Key Takeaways:**

1. ✅ **Isolate tests** - Use worker-scoped data, clean up in `beforeEach`
2. ✅ **Use robust selectors** - Prefer test IDs and semantic roles
3. ✅ **Wait explicitly** - Use `waitForURL`, `waitFor`, `expect`
4. ✅ **Leverage fixtures** - Use `adminPage` for authenticated tests
5. ✅ **Access database** - Verify data, retrieve test values
6. ✅ **Write parallel-safe** - Use `testInfo.workerIndex`
7. ✅ **Debug effectively** - Use UI mode, traces, and inspector

Following these practices ensures your Playwright tests are **reliable, maintainable, and fast**.
