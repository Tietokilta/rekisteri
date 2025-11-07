# Testing Strategy

## Overview

This project uses a **hybrid testing approach** combining integration tests (Vitest) and end-to-end tests (Playwright) to ensure comprehensive coverage while maintaining fast, reliable test execution.

## Test Types

### 1. Integration Tests (Vitest)

**Location:** `src/**/*.{test,spec}.ts`
**Command:** `pnpm test:unit`
**Purpose:** Test server-side business logic, database operations, and API integrations

**What we test:**

- ✅ Webhook handling logic
- ✅ Database state changes
- ✅ Server-side functions
- ✅ Payment session management
- ✅ Transaction safety
- ✅ Error handling

**Example:** `src/lib/server/payment/session.test.ts`

```typescript
it("updates member status from awaiting_payment to awaiting_approval", async () => {
  await db.insert(table.member).values({ status: "awaiting_payment", ... });
  await fulfillSession(sessionId);
  const member = await getMember();
  expect(member.status).toBe("awaiting_approval");
});
```

### 2. End-to-End Tests (Playwright)

**Location:** `e2e/**/*.test.ts`
**Command:** `pnpm test:e2e`
**Purpose:** Test complete user flows from the browser perspective

**What we test:**

- ✅ User authentication flows
- ✅ Form submission and validation
- ✅ Navigation and routing
- ✅ Access control
- ✅ Integration with external services (up to redirect)
- ✅ UI state management

**What we DON'T test:**

- ❌ Stripe Checkout form (security restrictions prevent automation)
- ❌ Third-party UIs (Stripe, Mailgun, etc.)
- ❌ Implementation details (CSS classes, internal state)

### 3. Manual Testing

**When:** Before each release
**Purpose:** Validate flows that cannot be automated

**Checklist:**

- [ ] Complete purchase with test card `4242 4242 4242 4242`
- [ ] Test declined card `4000 0000 0000 0002`
- [ ] Verify webhook received and processed
- [ ] Test session expiration (24h timeout)
- [ ] Verify email delivery (OTP, notifications)

## Test Organization

```
rekisteri/
├── e2e/                          # End-to-end tests (Playwright)
│   ├── fixtures/
│   │   └── auth.ts              # Auth fixtures for authenticated tests
│   ├── auth.test.ts             # Authentication flows
│   ├── stripe-integration.test.ts  # Stripe checkout integration
│   ├── membership-purchase.test.ts # Membership selection UI
│   ├── admin-members.test.ts    # Admin member management
│   ├── admin-memberships.test.ts # Admin membership management
│   ├── user-profile.test.ts     # User profile editing
│   ├── navigation.test.ts       # Navigation and access control
│   └── csv-import.test.ts       # CSV import functionality
│
└── src/
    └── lib/server/payment/
        └── session.test.ts      # Integration: Webhook handling
```

## Running Tests

### All Tests

```bash
pnpm test                    # Run all tests (integration + e2e)
```

### Integration Tests Only

```bash
pnpm test:unit               # Run once
pnpm test:unit:watch         # Watch mode for development
```

### E2E Tests Only

```bash
pnpm test:e2e                # Run all e2e tests
pnpm test:e2e --ui           # Run with Playwright UI
pnpm test:e2e --headed       # Run in headed mode (see browser)
pnpm test:e2e --debug        # Debug mode
```

### Specific Tests

```bash
pnpm test:unit session.test.ts           # Run specific integration test
pnpm test:e2e stripe-integration.test.ts # Run specific e2e test
```

## CI/CD

Tests run automatically in GitHub Actions on:

- Every pull request
- Push to main branch
- Manual workflow dispatch

**CI Workflow:**

1. Install dependencies
2. Setup test database
3. Run linting and type checks
4. Run integration tests (Vitest)
5. Run e2e tests (Playwright)
6. Build and deploy (on main only)

## Stripe Testing Strategy

### What We Can Test (Automated)

**Integration Tests (Vitest):**

- ✅ Webhook event handling
- ✅ Member status transitions
- ✅ Database state changes
- ✅ Race condition handling
- ✅ Error scenarios

**E2E Tests (Playwright):**

- ✅ Checkout session creation
- ✅ Redirect to Stripe
- ✅ Success/cancel redirect handling
- ✅ Member record creation

### What We Cannot Test (Must Be Manual)

Due to Stripe's security measures:

- ❌ Filling out Stripe Checkout form
- ❌ Entering test card numbers
- ❌ Clicking buttons on Stripe's hosted page

**Why:** Stripe's frontend has security measures that prevent automation. This is intentional and cannot be bypassed.

**Solution:** Use manual testing checklist before releases.

### Testing with Stripe CLI (Optional)

For local webhook testing:

```bash
# Terminal 1: Start app
pnpm dev

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:5173/api/webhook/stripe

# Terminal 3: Trigger test webhook
stripe trigger checkout.session.completed
```

See `E2E_STRIPE_TESTING.md` for detailed Stripe testing documentation.

## Test Data Management

### Integration Tests

- Each test creates and cleans up its own data
- Uses `beforeEach` and `afterEach` hooks
- Test database: `DATABASE_URL_TEST` from `.env`

### E2E Tests

- Uses global setup to seed test database
- Admin user: `root@tietokilta.fi`
- Test memberships seeded automatically
- Isolated test database per run

## Best Practices

### DO ✅

- Test user value and business requirements
- Use stable selectors (roles, labels, test IDs)
- Write tests that act as living documentation
- Test critical paths and edge cases
- Clean up test data in `afterEach`
- Use meaningful test descriptions

### DON'T ❌

- Test implementation details (CSS classes, internal state)
- Test third-party code (Stripe's UI, external APIs)
- Write tests that just check "element exists"
- Use fragile selectors (`.first()`, complex CSS)
- Leave test data in database
- Duplicate test coverage

## Writing New Tests

### Integration Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "$lib/server/db";

describe("Feature Name", () => {
  let testId: string;

  beforeEach(async () => {
    // Setup test data
    testId = crypto.randomUUID();
    await db.insert(...);
  });

  afterEach(async () => {
    // Clean up
    await db.delete(...);
  });

  it("does what it should do", async () => {
    // Arrange
    const input = "test";

    // Act
    const result = await functionUnderTest(input);

    // Assert
    expect(result).toBe("expected");
  });
});
```

### E2E Test Template

```typescript
import { test, expect } from "./fixtures/auth";

test.describe("Feature Name", () => {
	test("user can complete the flow", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/path");

		// Interact with page
		await authenticatedPage.getByRole("button", { name: "Submit" }).click();

		// Verify outcome
		await expect(authenticatedPage).toHaveURL(/success/);
	});
});
```

## Test Coverage Goals

- ✅ **Critical paths:** 100% coverage (auth, purchase, admin actions)
- ✅ **Business logic:** 100% coverage (webhooks, state transitions)
- ✅ **Happy paths:** All covered
- ✅ **Error cases:** Major errors covered
- ⚠️ **UI components:** Tested via integration where possible
- ⚠️ **Edge cases:** Cover as needed

## Troubleshooting

### Tests Fail Locally

1. Ensure test database is running: `pnpm db:start`
2. Reset test database: `pnpm db:reset && pnpm db:push:force`
3. Check environment variables in `.env`
4. Clear Playwright cache: `npx playwright install`

### Tests Pass Locally but Fail in CI

1. Check Node version matches CI (v24.5.0)
2. Verify test database is seeded in CI
3. Check for timing issues (add `waitForTimeout` if needed)
4. Review CI logs for specific errors

### Flaky Tests

1. Add explicit waits instead of `waitForTimeout`
2. Use `waitForLoadState('networkidle')` for navigation
3. Check for race conditions in test setup/teardown
4. Ensure proper test isolation (clean up between tests)

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Stripe Testing Guide](https://docs.stripe.com/testing)
- [Project-Specific Guides](./docs/)
  - `E2E_TEST_REVIEW.md` - Critical analysis of test quality
  - `E2E_TEST_IMPROVEMENTS.md` - Improvement recommendations
  - `E2E_STRIPE_TESTING.md` - Stripe-specific testing strategy

## Metrics

**Current Test Count:**

- Integration tests: ~12 tests
- E2E tests: ~60 tests
- Total: ~72 tests

**Coverage:**

- ✅ Authentication flows
- ✅ Purchase flow (up to Stripe redirect)
- ✅ Webhook handling
- ✅ Admin member management
- ✅ Admin membership management
- ✅ CSV import
- ✅ User profile
- ✅ Navigation and access control

**Test Execution Time:**

- Integration tests: ~5-10s
- E2E tests: ~2-3min
- Total: ~3-4min
