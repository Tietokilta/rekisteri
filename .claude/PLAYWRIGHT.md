# Playwright Testing Guide

This guide provides comprehensive documentation for writing end-to-end tests with Playwright in the rekisteri project. Following these best practices ensures robust, maintainable, and parallelizable tests.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Architecture](#test-architecture)
3. [Best Practices](#best-practices)
4. [Selectors Strategy](#selectors-strategy)
5. [Internationalization and Selectors](#internationalization-and-selectors)
6. [Authentication Fixtures](#authentication-fixtures)
7. [Database Access in Tests](#database-access-in-tests)
8. [Parallel Test Execution](#parallel-test-execution)
9. [Setup and Teardown](#setup-and-teardown)
10. [Common Patterns](#common-patterns)
11. [Page Object Model](#page-object-model)
12. [Playwright MCP Integration](#playwright-mcp-integration)
13. [Debugging and Troubleshooting](#debugging-and-troubleshooting)

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

		// Your test logic - prefer semantic selectors
		await expect(adminPage.getByRole("button", { name: "Tallenna" })).toBeVisible();
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
├── pages/                    # Page Object Models (recommended)
│   ├── login-page.ts
│   └── admin-members-page.ts
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
- **Locale**: Finnish (`fi-FI`) - **locked for test stability**
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
	// Generate unique email for this test
	const email = `test-${crypto.randomUUID()}@example.com`;

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

### 2. Use Worker-Scoped Unique Data

For parallel execution, use **cryptographically unique identifiers**:

```typescript
// ✅ Good: Cryptographically unique
const getTestEmail = (prefix: string) =>
	`${prefix}-${crypto.randomUUID()}@example.com`;

test("my test", async ({ adminPage }) => {
	const email = getTestEmail("test");
	// Safe for parallel execution
});

// ❌ Bad: Date.now() can collide in fast execution
const email = `test-${Date.now()}@example.com`;  // ❌ May not be unique
```

**Why not `Date.now()`?** In fast local execution or powerful CI, `Date.now()` can return the same integer for operations happening in the same millisecond, causing collisions.

### 3. Clean Up Test Data

**Prefer specific cleanup over pattern matching** for performance and reliability:

```typescript
// ✅ Good: Clean up specific records created by this test
test("should create item", async ({ adminPage }) => {
	const itemId = crypto.randomUUID();

	// Create item with known ID
	await createItem(adminPage, itemId);

	// ... test logic ...

	// Clean up specific item
	await db.delete(table.items).where(eq(table.items.id, itemId));
});

// ⚠️ Use with caution: Pattern-based cleanup can be slow
test.beforeEach(async ({}, testInfo) => {
	// LIKE queries are slow as database grows
	const workerPattern = `%-w${testInfo.workerIndex}-%`;
	await db.delete(table.emailOTP).where(like(table.emailOTP.email, workerPattern));
});
```

**Pattern-based cleanup risks:**
- SQL `LIKE` is slow as the database grows
- If test crashes, data remains until next run (dirty default state)
- Pattern logic bugs could accidentally delete other tests' data

**Better approach:** Clean specific IDs in `afterEach`, or use database transactions that roll back after tests.

### 4. Wait for Navigation Explicitly

Always wait for navigation to complete:

```typescript
// ✅ Good: Explicit wait
await page.getByRole("button", { name: "Tallenna" }).click();
await page.waitForURL(/expected-route/);

// ❌ Bad: Race condition possible
await page.getByRole("button", { name: "Tallenna" }).click();
await expect(page.getByTestId("success")).toBeVisible();
```

### 5. Use Appropriate Wait Strategies

```typescript
// Wait for element state
await page.getByRole("button", { name: "Tallenna" }).waitFor({ state: "visible" });

// Wait for network idle (use sparingly, prefer specific conditions)
await page.goto("/fi/admin/members", { waitUntil: "networkidle" });

// Wait for specific condition
await expect(page.getByTestId("loading")).toBeHidden();
```

---

## Selectors Strategy

Use selectors in this **priority order** to ensure accessibility and maintainability:

### 1. Semantic Roles and Accessible Attributes (Highest Priority)

**Always prefer user-facing attributes first.** If you test by role/label, you verify the element is both functional and accessible.

```typescript
// ✅ Best: Verifies accessibility and functionality
await page.getByRole("button", { name: "Tallenna" }).click();
await page.getByRole("heading", { name: "Hallintapaneeli" }).waitFor();
await page.getByLabel("Sähköposti").fill("user@example.com");
await page.getByPlaceholder("Syötä sähköpostiosoite").fill("user@example.com");
```

**Why this is #1:** If a button is invisible to screen readers or has broken ARIA attributes, the test will catch it. Testing by `data-testid` would pass even if the element is completely inaccessible.

**Common roles to use:**
- `button`, `link`, `textbox`, `checkbox`, `radio`, `heading`, `img`, `list`, `listitem`, `dialog`, `alert`

### 2. Test IDs (When Roles Are Ambiguous)

Use `data-testid` for elements where semantic roles are ambiguous or dynamic:

```typescript
// In Svelte component:
<button data-testid="submit-add-email">Lisää sähköposti</button>

// In test:
await page.getByTestId("submit-add-email").click();
```

**When to add test IDs:**
- Multiple similar elements on the page (e.g., multiple "Delete" buttons)
- Elements with dynamic text content
- Complex components where role selectors become verbose
- Elements in data tables or lists that need specific targeting

### 3. Text Content (Stable Text Only)

Use for unique, stable text that won't change frequently:

```typescript
// ✅ Good: Stable, unique text
await page.getByText("Tervetuloa takaisin!").waitFor();

// ⚠️ Use carefully: Text may change or be translated
await page.getByText("Poista").click();  // Better to use getByRole
```

### 4. CSS Selectors (Last Resort)

Only when no better option exists:

```typescript
// Only when necessary
await page.locator('input[type="email"]').fill(email);
await page.locator('input[autocomplete="given-name"]').fill("John");
```

### ❌ Avoid These Selectors

```typescript
// DON'T use brittle selectors
await page.locator(".css-class-name");  // ❌ Classes change
await page.locator("div > div > button");  // ❌ Structure changes
await page.locator("xpath=//button[1]");  // ❌ Position-based
await page.locator('[data-slot="input-otp"]');  // ❌ Library internals (see below)
```

### ⚠️ Warning: Avoid Library Internal Selectors

**Do not rely on `data-slot` or other library-internal attributes:**

```typescript
// ❌ Bad: Relies on bits-ui/shadcn-svelte internals
await page.locator('[data-slot="input-otp"]').pressSequentially(code);
await page.locator('[data-slot="item"]').filter({ hasText: email });

// ✅ Good: Add explicit test IDs to your component instances
<InputOTP data-testid="otp-input" />
await page.getByTestId("otp-input").pressSequentially(code);
```

**Why avoid library internals?** If you update `bits-ui` or `shadcn-svelte`, internal slot names might change, breaking your entire test suite. Add `data-testid` to component instances in your code instead.

---

## Internationalization and Selectors

The rekisteri project supports multiple languages (Finnish and English), which significantly affects selector strategy.

### The Locked Locale Approach

**This project uses a locked locale (`fi-FI`) for tests.** This is configured in `playwright.config.ts`:

```typescript
export default defineConfig({
	use: {
		locale: "fi-FI",  // Locked to Finnish
		timezoneId: "Europe/Helsinki",
	},
});
```

### Why Lock the Locale?

**User-facing selectors (`getByRole`, `getByLabel`) are too valuable to give up** for the sake of multi-language testing. They catch:

- Accessibility bugs (missing ARIA attributes)
- Semantic HTML issues (divs pretending to be buttons)
- User-visible text rendering

By locking to Finnish, you can confidently use:

```typescript
await page.getByRole("button", { name: "Tallenna" }).click();
await page.getByLabel("Sähköposti").fill("user@example.com");
```

These selectors verify that:
1. The button is actually a button (accessible)
2. The text "Tallenna" renders correctly
3. The element is interactive

### Testing Other Locales

If you need to test English or other locales:

**Option 1: Separate test files**
```typescript
// e2e/auth-fi.test.ts
test("Finnish sign-in", async ({ page }) => {
	await page.goto("/fi/sign-in");
	await page.getByRole("button", { name: "Kirjaudu" }).click();
});

// e2e/auth-en.test.ts
test("English sign-in", async ({ page }) => {
	await page.goto("/en/sign-in");
	await page.getByRole("button", { name: "Sign in" }).click();
});
```

**Option 2: Use test IDs for multi-locale tests**
```typescript
// If you must run same test against multiple locales
await page.getByTestId("sign-in-button").click();
```

### Summary: Selector Priority for i18n Apps

1. **`getByRole` / `getByLabel`** (with locked locale) - Best for accessibility and functionality
2. **`getByTestId`** - Use when text is dynamic or you test multiple locales
3. **`getByText`** - Only for stable, unique text
4. **CSS selectors** - Last resort

**Don't downgrade semantic selectors.** Standardize the environment (locked locale) so text is predictable.

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

### ⚠️ Global Admin User Warning

**Tests using global admin fixtures must be read-only regarding the admin's account settings.**

```typescript
// ✅ Good: Read-only operations on admin account
test("should view admin dashboard", async ({ adminPage }) => {
	await adminPage.goto("/fi/admin/members");
	await expect(adminPage.getByRole("heading", { name: /jäsenet/i })).toBeVisible();
});

// ❌ Bad: Modifying admin user settings
test("should change user language", async ({ adminPage, adminUser }) => {
	// This will break ALL other tests using adminPage!
	await adminPage.goto("/fi/settings");
	await adminPage.getByTestId("language-select").selectOption("en");
	await adminPage.getByRole("button", { name: "Tallenna" }).click();
});
```

**Why?** If any test modifies the admin user's settings (language, password, profile), all other tests using the `admin.json` storage state will fail due to a race condition.

**Solution:** If a test needs to modify user settings, create a fresh user for that specific test:

```typescript
test("should change user language", async ({ page }) => {
	// Create a new user just for this test
	const testUser = await createTestUser(db);
	await loginAs(page, testUser);

	// Now safe to modify settings
	await page.goto("/fi/settings");
	await page.getByTestId("language-select").selectOption("en");
});
```

### Testing Unauthenticated Flows

For testing authentication flows, use the default `page` fixture:

```typescript
import { test as base, expect } from "@playwright/test";

test("sign-in flow", async ({ page }) => {
	await page.goto("/fi/sign-in");

	await page.fill('input[type="email"]', "user@example.com");
	await page.getByRole("button", { name: /kirjaudu/i }).click();

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

Tests can directly access the database, but **use it judiciously** to avoid white-box testing.

### When to Use Database Access

#### ✅ Appropriate Uses

1. **Seeding data** - Setting up test state
2. **Retrieving secrets** - OTPs, tokens not visible in UI
3. **Cleaning up** - Deleting test data

#### ❌ Avoid for Assertions

**Don't verify functionality by checking the database when the UI can verify it:**

```typescript
// ❌ Bad: White-box testing
test("should create item", async ({ adminPage }) => {
	await adminPage.goto("/fi/items/create");
	await adminPage.fill('input[name="name"]', "Test Item");
	await adminPage.getByRole("button", { name: "Tallenna" }).click();

	// Testing implementation (DB schema), not user experience
	const [record] = await db
		.select()
		.from(table.items)
		.where(eq(table.items.name, "Test Item"));

	expect(record).toBeDefined();  // ❌ Bad
});

// ✅ Good: Black-box testing
test("should create item", async ({ adminPage }) => {
	await adminPage.goto("/fi/items/create");
	await adminPage.fill('input[name="name"]', "Test Item");
	await adminPage.getByRole("button", { name: "Tallenna" }).click();

	// Verify via UI
	await expect(adminPage).toHaveURL(/items$/);
	await expect(adminPage.getByText("Test Item")).toBeVisible();
	// If UI shows it, it works - no need to check DB
});
```

**Why?** If you later rename a DB column or change the schema, your E2E test breaks even if the app works perfectly for users. Test the user experience, not the implementation.

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

### Appropriate Database Patterns

#### ✅ Retrieve Secrets (OTPs, Tokens)

```typescript
test("should process OTP", async ({ adminPage }) => {
	const email = `test-${crypto.randomUUID()}@example.com`;

	// Trigger OTP send
	await adminPage.goto("/fi/sign-in");
	await adminPage.fill('input[type="email"]', email);
	await adminPage.getByRole("button", { name: /lähetä/i }).click();

	// ✅ Good: Retrieve OTP from database (not visible in UI)
	const [otp] = await db
		.select()
		.from(table.emailOTP)
		.where(eq(table.emailOTP.email, email.toLowerCase()));

	expect(otp?.code).toMatch(/^[A-Z2-7]{8}$/);

	// Use OTP in test
	await adminPage.getByTestId("otp-input").pressSequentially(otp.code);
});
```

#### ✅ Seed Test Data

```typescript
test("should display seeded items", async ({ adminPage }) => {
	// ✅ Good: Seed data for test setup
	const itemId = crypto.randomUUID();
	await db.insert(table.items).values({
		id: itemId,
		name: "Seeded Item",
		createdAt: new Date(),
	});

	await adminPage.goto("/fi/items");

	// Verify via UI, not DB
	await expect(adminPage.getByText("Seeded Item")).toBeVisible();
});
```

#### ✅ Clean Up Specific Records

```typescript
test("should create item", async ({ adminPage }) => {
	const itemId = crypto.randomUUID();

	// Create via UI
	await createItemViaUI(adminPage, itemId);

	// ... test assertions ...

	// ✅ Good: Clean up specific record
	await db.delete(table.items).where(eq(table.items.id, itemId));
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

#### Use Unique IDs for Data

```typescript
// ✅ Good: Cryptographically unique data
test("my test", async ({ adminPage }) => {
	const email = `test-${crypto.randomUUID()}@example.com`;
	// Safe for parallel execution - guaranteed unique
});

// ❌ Bad: Same data across workers
test("my test", async ({ adminPage }) => {
	const email = "test@example.com";  // ❌ Collision across workers
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
		// Example: Navigate to starting page
	});

	test.afterEach(async ({ page }) => {
		// Runs after each test
		// Example: Clean up specific test data
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
2. **Test data cleanup**: Use `afterEach` to clean specific IDs, or `beforeEach` for pattern cleanup
3. **Shared expensive operations**: Use `beforeAll` (e.g., seeding large datasets)
4. **Cleanup**: Prefer `beforeEach` over `afterEach` (ensures clean state even if test fails)

---

## Common Patterns

### Pattern 1: Fill Form and Submit

```typescript
test("should submit form", async ({ adminPage }) => {
	await adminPage.goto("/fi/form-page");

	// Fill form fields using accessible selectors
	await adminPage.getByLabel("Etunimi").fill("John");
	await adminPage.getByLabel("Sukunimi").fill("Doe");
	await adminPage.getByLabel("Sähköposti").fill("john@example.com");

	// Submit and wait for navigation
	await adminPage.getByRole("button", { name: "Tallenna" }).click();
	await adminPage.waitForURL(/success/);

	// Verify result via UI
	await expect(adminPage.getByText("Tallennettu onnistuneesti")).toBeVisible();
});
```

### Pattern 2: Handle OTP Flow

```typescript
test("should verify OTP", async ({ adminPage }) => {
	const email = `test-${crypto.randomUUID()}@example.com`;

	// Trigger OTP
	await adminPage.goto("/fi/verify");
	await adminPage.getByLabel("Sähköposti").fill(email);
	await adminPage.getByRole("button", { name: "Lähetä koodi" }).click();
	await adminPage.waitForURL(/enter-code/);

	// Retrieve OTP from database (not visible in UI)
	const [otp] = await db
		.select()
		.from(table.emailOTP)
		.where(eq(table.emailOTP.email, email.toLowerCase()));

	if (!otp) throw new Error("OTP not found");

	// Enter OTP
	await adminPage.getByTestId("otp-input").pressSequentially(otp.code);

	// Verify success
	await adminPage.waitForURL(/success/);
});
```

### Pattern 3: Handle Dialogs

```typescript
test("should handle confirmation dialog", async ({ adminPage }) => {
	// Setup dialog handler BEFORE triggering action
	adminPage.on("dialog", async (dialog) => {
		expect(dialog.message()).toContain("Oletko varma?");
		await dialog.accept();  // Accept the dialog
	});

	await adminPage.getByRole("button", { name: "Poista" }).click();

	// Dialog is handled by the listener above
	await expect(adminPage.getByTestId("item")).toBeHidden();
});
```

**Important:** Without a dialog listener, Playwright **automatically dismisses** dialogs. The listener is required if you want to **accept** (click OK) or verify the message.

### Pattern 4: Multi-User Scenarios

```typescript
test("should handle multi-user interaction", async ({ adminPage, browser }) => {
	// Admin user creates item
	await adminPage.goto("/fi/admin/items/create");
	const itemName = `item-${crypto.randomUUID()}`;
	await adminPage.getByLabel("Nimi").fill(itemName);
	await adminPage.getByRole("button", { name: "Luo" }).click();

	// Create second user context
	const userContext = await browser.newContext();
	const userPage = await userContext.newPage();

	try {
		// Second user sees the change
		await userPage.goto("/fi/items");
		await expect(userPage.getByText(itemName)).toBeVisible();
	} finally {
		await userContext.close();
	}
});
```

### Pattern 5: Testing Internationalization

```typescript
test("should work in Finnish", async ({ adminPage }) => {
	await adminPage.goto("/fi/admin/members");
	await expect(adminPage.getByRole("heading", { name: /jäsenet/i })).toBeVisible();
});

test("should work in English", async ({ adminPage }) => {
	await adminPage.goto("/en/admin/members");
	await expect(adminPage.getByRole("heading", { name: /members/i })).toBeVisible();
});

// Or use regex for both languages
test("should show heading in any language", async ({ adminPage }) => {
	await adminPage.goto("/fi/admin/members");
	await expect(adminPage.getByRole("heading", { name: /jäsenet|members/i })).toBeVisible();
});
```

---

## Page Object Model

As your test suite grows, **Page Object Model (POM)** helps maintain reusable, encapsulated page interactions.

### Why Use Page Object Model?

**Without POM:** Helper functions scattered across test files

```typescript
// e2e/auth.test.ts
const loginAs = async (page, email) => { /* ... */ };

// e2e/admin.test.ts
const loginAs = async (page, email) => { /* ... */ };  // Duplicated!
```

**With POM:** Centralized, reusable page classes

```typescript
// e2e/pages/login-page.ts
export class LoginPage { /* ... */ }

// Used everywhere consistently
```

### Creating a Page Object

```typescript
// e2e/pages/login-page.ts
import { type Page, type Locator } from "@playwright/test";

export class LoginPage {
	readonly page: Page;
	readonly emailInput: Locator;
	readonly submitButton: Locator;

	constructor(page: Page) {
		this.page = page;
		this.emailInput = page.getByLabel("Sähköposti");
		this.submitButton = page.getByRole("button", { name: "Kirjaudu" });
	}

	async goto() {
		await this.page.goto("/fi/sign-in");
	}

	async login(email: string) {
		await this.emailInput.fill(email);
		await this.submitButton.click();
		await this.page.waitForURL(/sign-in\/method/);
	}

	async loginWithOTP(email: string, otp: string) {
		await this.login(email);
		await this.page.getByRole("button", { name: /sähköposti/i }).click();
		await this.page.getByTestId("otp-input").pressSequentially(otp);
		await this.page.waitForURL(/\/fi$/);
	}
}
```

### Using Page Objects in Tests

```typescript
import { test, expect } from "./fixtures/auth";
import { LoginPage } from "./pages/login-page";

test("should login with OTP", async ({ page }) => {
	const loginPage = new LoginPage(page);
	const email = `test-${crypto.randomUUID()}@example.com`;

	await loginPage.goto();
	await loginPage.login(email);

	// Retrieve OTP from database
	const [otp] = await db.select()...;

	await loginPage.loginWithOTP(email, otp.code);

	// Verify success
	await expect(page.getByRole("heading", { name: /tervetuloa/i })).toBeVisible();
});
```

### Page Object Best Practices

1. **Encapsulate selectors** - All locators defined in the page class
2. **Encapsulate actions** - Methods like `login()`, `fillForm()`, `submit()`
3. **Return new pages** - Navigation methods return new page objects
4. **Use semantic selectors** - `getByRole`, `getByLabel` inside page objects
5. **No assertions** - Page objects should not contain `expect()` - only actions and locators

### Advanced: Fixtures with Page Objects

```typescript
// e2e/fixtures/pages.ts
import { test as base } from "@playwright/test";
import { LoginPage } from "../pages/login-page";
import { AdminMembersPage } from "../pages/admin-members-page";

type PageFixtures = {
	loginPage: LoginPage;
	adminMembersPage: AdminMembersPage;
};

export const test = base.extend<PageFixtures>({
	loginPage: async ({ page }, use) => {
		await use(new LoginPage(page));
	},
	adminMembersPage: async ({ page }, use) => {
		await use(new AdminMembersPage(page));
	},
});
```

Usage:

```typescript
import { test, expect } from "./fixtures/pages";

test("should manage members", async ({ adminMembersPage }) => {
	await adminMembersPage.goto();
	await adminMembersPage.addMember("Test", "User", "test@example.com");

	await expect(adminMembersPage.membersList).toContainText("Test User");
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
	await adminPage.getByRole("button", { name: "Lataa" }).click({ timeout: 30000 });
});
```

#### Issue: Flaky Tests

```typescript
// ❌ Bad: Race condition
await page.getByRole("button", { name: "Tallenna" }).click();
await expect(page.getByText("Tallennettu")).toBeVisible();

// ✅ Good: Wait for navigation/state
await page.getByRole("button", { name: "Tallenna" }).click();
await page.waitForURL(/success/);
await expect(page.getByText("Tallennettu")).toBeVisible();
```

#### Issue: Stale Element

```typescript
// ❌ Bad: Element reference can become stale
const button = page.getByRole("button", { name: "Tallenna" });
await page.getByLabel("Nimi").fill("value");
await button.click();  // May be stale

// ✅ Good: Get fresh reference
await page.getByLabel("Nimi").fill("value");
await page.getByRole("button", { name: "Tallenna" }).click();
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
	const items = adminPage.getByRole("listitem");
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
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing)

---

## Summary

**Key Takeaways:**

1. ✅ **Isolate tests** - Use unique IDs (`crypto.randomUUID()`), clean up specific records
2. ✅ **Prioritize accessibility** - Use `getByRole` and `getByLabel` with locked locale
3. ✅ **Avoid white-box testing** - Test via UI, not database (except for secrets/setup)
4. ✅ **Wait explicitly** - Use `waitForURL`, `waitFor`, `expect`
5. ✅ **Leverage fixtures** - Use `adminPage` for authenticated tests (read-only)
6. ✅ **Use Page Objects** - Encapsulate selectors and actions for maintainability
7. ✅ **Write parallel-safe** - Use cryptographically unique identifiers
8. ✅ **Debug effectively** - Use UI mode, traces, and inspector

Following these practices ensures your Playwright tests are **reliable, maintainable, accessible, and fast**.
