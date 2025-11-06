# E2E Testing Strategy for Stripe Integration

## Current Purchase Flow

```
User submits form
    ↓
Server creates Stripe Checkout Session
    ↓
User redirects to Stripe's hosted page (stripe.com)
    ↓
User enters card details on Stripe's page
    ↓
Payment succeeds/fails
    ↓
Stripe sends webhook to our server
    ↓
Server updates member status (awaiting_payment → awaiting_approval)
    ↓
Admin approves member (awaiting_approval → active)
```

## Challenge: Stripe's Security Measures

**Stripe Checkout forms CANNOT be automated** for security reasons:
- ✅ **Can test:** Creating checkout session, redirecting to Stripe
- ❌ **Cannot test:** Filling out card form on Stripe's hosted page
- ✅ **Can test:** Webhook handling, success/cancel redirects

**Official Stripe Recommendation:**
> "Frontend interfaces, like Stripe Checkout or the Payment Element, have security measures
> in place that prevent automated testing. Use mock data to test your application behavior."

---

## Testing Strategy Options

### Option 1: Test What You Can (Current Approach) ⭐ Recommended for MVP

**What to test:**
```typescript
// ✅ Test form submission creates checkout session
test("submitting purchase form redirects to Stripe", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/new");

  // Select membership
  await authenticatedPage.locator('input[name="membershipId"]').first().click();
  await authenticatedPage.locator('button[type="submit"]').click();

  // Verify redirect to Stripe (URL contains checkout.stripe.com)
  await authenticatedPage.waitForURL(/checkout\.stripe\.com/);
});

// ✅ Test webhook handling
test("webhook updates member status after payment", async () => {
  // Use Stripe CLI to send test webhook
  // Or manually POST to /api/webhook/stripe with signed payload
});

// ✅ Test success/cancel redirects
test("handles successful payment redirect", async ({ page }) => {
  await page.goto("/?stripeStatus=success");
  // Verify success message or UI state
});
```

**Pros:**
- Simple, no external dependencies
- Tests real integration points
- Fast, reliable

**Cons:**
- Doesn't test actual payment
- Doesn't test card decline scenarios

---

### Option 2: Webhook Testing with Stripe CLI ⭐ Recommended

Test the full flow by simulating webhooks:

```typescript
// 1. Setup: Start Stripe CLI webhook forwarding
// pnpm stripe listen --forward-to localhost:4173/api/webhook/stripe

// 2. In test, create session and trigger webhook
test("complete purchase flow with webhook", async ({ adminPage }) => {
  // Create session (start purchase)
  await adminPage.goto("/new");
  await adminPage.locator('input[name="membershipId"]').first().click();
  await adminPage.locator('button[type="submit"]').click();

  // Extract session ID from URL or database
  const sessionId = await getSessionIdFromDb();

  // Trigger test webhook using Stripe CLI
  await exec(`stripe trigger checkout.session.completed --override checkout.session.id=${sessionId}`);

  // Verify member status updated
  await adminPage.goto("/admin/members");
  await expect(adminPage.getByText("awaiting_approval")).toBeVisible();
});
```

**Pros:**
- Tests real webhook flow
- Can test success, failure, expiration scenarios
- Uses real Stripe infrastructure (test mode)

**Cons:**
- Requires Stripe CLI installed
- More complex setup
- Slower tests

---

### Option 3: Mock Stripe Responses (Unit Test Approach)

For CI/CD pipelines, mock Stripe entirely:

```typescript
// Mock stripe SDK
vi.mock("stripe", () => ({
  default: class Stripe {
    checkout = {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: "cs_test_mock",
          url: "https://checkout.stripe.com/test",
        }),
        retrieve: vi.fn().mockResolvedValue({
          payment_status: "paid",
        }),
      },
    },
  },
}));

test("purchase creates member record", async ({ request }) => {
  const response = await request.post("/new", {
    data: { membershipId: "membership-id" },
  });

  // Verify member created with status "awaiting_payment"
  const member = await db.query.member.findFirst();
  expect(member.status).toBe("awaiting_payment");
});
```

**Pros:**
- Fast, deterministic
- No external dependencies
- Perfect for CI/CD
- Can test error scenarios easily

**Cons:**
- Not testing real Stripe integration
- Doesn't catch API changes
- More of a unit test than E2E

---

### Option 4: Hybrid Approach ⭐⭐ Best Practice

Combine strategies for comprehensive coverage:

```typescript
// E2E: Test up to Stripe redirect
test("user can initiate purchase", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/new");
  await authenticatedPage.locator('input[name="membershipId"]').first().click();
  await authenticatedPage.locator('button[type="submit"]').click();

  // Stop at Stripe redirect (can't automate further)
  await expect(authenticatedPage).toHaveURL(/checkout\.stripe\.com/);
});

// Integration: Test webhook handling
test("webhook updates member status", async () => {
  // Create member with awaiting_payment status
  const memberId = await createTestMember();

  // Simulate webhook
  await simulateStripeWebhook({
    type: "checkout.session.completed",
    data: { object: { id: sessionId } },
  });

  // Verify status updated
  const member = await getMember(memberId);
  expect(member.status).toBe("awaiting_approval");
});

// Manual: Use Stripe test mode for critical path testing
// Test with real Stripe UI once per release
```

**Pros:**
- Comprehensive coverage
- Fast automated tests
- Occasional manual validation
- Catches integration issues

**Cons:**
- More complex test suite
- Requires both automated and manual testing

---

## Recommended Testing Strategy

### For Your Current Tests:

**1. Keep the existing test (valid requirement):**
```typescript
test("requires authentication to purchase memberships", async ({ page }) => {
  await page.goto("/new");
  await expect(page).toHaveURL(/sign-in/);
});
```

**2. Add test for checkout redirect:**
```typescript
test("purchase redirects to Stripe Checkout", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/new");

  // Select a membership
  const firstOption = authenticatedPage.locator('input[name="membershipId"]').first();
  await firstOption.click();

  // Submit form
  await authenticatedPage.locator('button[type="submit"]').click();

  // Verify redirected to Stripe
  await expect(authenticatedPage).toHaveURL(/checkout\.stripe\.com/, { timeout: 10000 });
});
```

**3. Add webhook tests (separate file: `e2e/stripe-webhook.test.ts`):**
```typescript
import { test, expect } from "@playwright/test";
import { db } from "../src/lib/server/db";
import { eq } from "drizzle-orm";
import * as table from "../src/lib/server/db/schema";

test.describe("Stripe Webhook Handling", () => {
  test("completed checkout updates member to awaiting approval", async () => {
    // Create test member
    const memberId = crypto.randomUUID();
    const sessionId = "cs_test_" + Date.now();

    await db.insert(table.member).values({
      id: memberId,
      userId: "test-user-id",
      membershipId: "test-membership-id",
      stripeSessionId: sessionId,
      status: "awaiting_payment",
    });

    // Simulate Stripe webhook
    // (requires Stripe CLI or manual webhook trigger)
    // For now, test the fulfillSession function directly
    const { fulfillSession } = await import("../src/lib/server/payment/session");
    await fulfillSession(sessionId);

    // Verify status updated
    const updated = await db.query.member.findFirst({
      where: eq(table.member.id, memberId),
    });

    expect(updated?.status).toBe("awaiting_approval");
  });

  test("expired checkout cancels member", async () => {
    // Similar test for cancellation
  });
});
```

**4. Add test for redirect handling:**
```typescript
test("displays success message after successful payment", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/?stripeStatus=success");

  // Verify success indication (UI should show this)
  // Add UI element for this if it doesn't exist
  await expect(authenticatedPage.getByText(/payment successful|success/i)).toBeVisible();
});
```

---

## What NOT to Test

❌ **Don't try to automate:**
- Filling out Stripe Checkout form
- Entering test card numbers in Stripe UI
- Clicking buttons on Stripe's hosted page

These are blocked by Stripe for security and won't work in automated tests.

---

## Testing in CI/CD

**For GitHub Actions:**

```yaml
- name: Install Stripe CLI
  run: |
    wget https://github.com/stripe/stripe-cli/releases/download/v1.19.0/stripe_1.19.0_linux_x86_64.tar.gz
    tar -xvf stripe_1.19.0_linux_x86_64.tar.gz
    sudo mv stripe /usr/local/bin/

- name: Start Stripe webhook listener
  run: stripe listen --forward-to localhost:4173/api/webhook/stripe &
  env:
    STRIPE_API_KEY: ${{ secrets.STRIPE_TEST_KEY }}

- name: Run E2E tests
  run: pnpm test:e2e
```

---

## Manual Testing Checklist

**Once per release, manually test with Stripe Test Mode:**

1. ✅ Purchase membership with test card `4242 4242 4242 4242`
2. ✅ Verify webhook received and member status updated
3. ✅ Test card decline with `4000 0000 0000 0002`
4. ✅ Test expired session (wait 24h or use Stripe CLI)
5. ✅ Verify success/cancel redirects work correctly

---

## Summary

**Current Reality:**
- ✅ Can test: Form submission, redirect to Stripe, webhook handling
- ❌ Can't test: Actual payment form filling (security blocked)
- ✅ Should test: Integration points, state changes, error handling

**Best Approach for This Project:**
1. Keep existing tests (valid)
2. Add test for redirect to Stripe
3. Add webhook handler tests (unit/integration style)
4. Add success/cancel redirect tests
5. Manual testing for full flow validation

**Don't Over-test:**
- Testing Stripe Checkout UI = testing Stripe's code (they test it)
- Focus on: Your code's integration with Stripe
- Test: Session creation, webhook handling, state updates

---

## Code Example: Improved Purchase Tests

```typescript
/**
 * E2E Tests: Membership Purchase with Stripe
 *
 * Scope:
 * - Tests OUR integration with Stripe
 * - Cannot test Stripe's hosted checkout (security restrictions)
 * - Tests up to Stripe redirect and webhook handling
 *
 * Manual testing required:
 * - Actual payment with test cards
 * - Stripe UI behavior
 */
test.describe("Membership Purchase", () => {
  test("initiates Stripe Checkout session for selected membership", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/new");

    // Select membership
    const membershipOption = authenticatedPage.locator('input[name="membershipId"]').first();
    await membershipOption.click();

    // Submit purchase
    await authenticatedPage.locator('button[type="submit"]').click();

    // Verify: Redirected to Stripe's hosted checkout
    await expect(authenticatedPage).toHaveURL(/checkout\.stripe\.com/, { timeout: 10000 });
  });

  test("creates member record with awaiting_payment status", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/new");

    // Get initial member count
    const initialCount = await db.select().from(table.member);

    // Start purchase
    await authenticatedPage.locator('input[name="membershipId"]').first().click();
    await authenticatedPage.locator('button[type="submit"]').click();

    // Verify: Member record created
    const newMembers = await db.select().from(table.member);
    expect(newMembers.length).toBe(initialCount.length + 1);

    const newMember = newMembers[newMembers.length - 1];
    expect(newMember.status).toBe("awaiting_payment");
    expect(newMember.stripeSessionId).toBeTruthy();
  });

  test("handles payment success redirect", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/?stripeStatus=success");

    // Verify: Success indication shown
    // (Add UI element for this if needed)
    await expect(authenticatedPage).toHaveURL(/stripeStatus=success/);
  });

  test("handles payment cancellation redirect", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/?stripeStatus=cancel");

    // Verify: Cancel indication shown
    await expect(authenticatedPage).toHaveURL(/stripeStatus=cancel/);
  });
});
```

---

## Additional Resources

- [Stripe Test Mode Documentation](https://docs.stripe.com/test-mode)
- [Stripe Webhook Testing](https://docs.stripe.com/webhooks/test)
- [Stripe CLI for Testing](https://stripe.com/docs/stripe-cli)
- [Test Card Numbers](https://docs.stripe.com/testing#cards)
