# A-Grade Testing Roadmap

## Current State: B+ (85% Production Ready)

**What we have:**

- ✅ 60 focused tests covering critical flows
- ✅ Complete user journeys tested
- ✅ Database verification in tests
- ✅ Security testing (webhooks, auth)
- ✅ Integration + E2E separation

**What's missing for A-grade:**

- ❌ Test data independence (tests depend on seeded data)
- ❌ External service mocking (Stripe API, email)
- ❌ Fragile selectors (CSS classes, .first(), SVG elements)
- ❌ Limited error scenario coverage
- ❌ No performance/load testing
- ❌ No accessibility testing
- ❌ Tests can interfere with each other

---

## Gap Analysis: B+ → A

### 🔴 **Critical Gaps** (Block A-grade)

#### 1. **Test Data Dependence** - CRITICAL

**Current Problem:**

```typescript
test("admin approves member", async ({ adminPage }) => {
	// Relies on root@tietokilta.fi existing in DB
	// Relies on seeded memberships
	// If seed data changes, test breaks
	await adminPage.goto("/admin/members");
	const testMemberRow = adminPage.getByText("E2E ApprovalTest"); // What if doesn't exist?
});
```

**Why it's bad:**

- Tests break when seed data changes
- Tests aren't isolated (one test's changes affect others)
- Can't run tests in parallel safely
- Hard to reproduce failures locally

**A-Grade Solution:**

```typescript
test("admin approves member", async ({ adminPage, testData }) => {
	// Create fresh test data for THIS test
	const { user, member, membership } = await testData.createPendingMember({
		status: "awaiting_approval",
		firstNames: "Test",
		lastName: `Approval${Date.now()}`,
	});

	try {
		await adminPage.goto("/admin/members");
		const row = adminPage.getByText(`${user.firstNames} ${user.lastName}`);
		// Test logic...
	} finally {
		// Always cleanup, even if test fails
		await testData.cleanup();
	}
});
```

**Impact:** 🔴 **BLOCKS A-GRADE**

---

#### 2. **Fragile Selectors** - CRITICAL

**Current Problem:**

```typescript
// From access-control.test.ts
const buyLink = adminPage.locator('a[href*="/new"]').first(); // What if there are multiple?

// From admin-workflows.test.ts
const expandButton = testMemberRow.locator("..").locator("button:has(svg)").first(); // Fragile!

// From profile.test.ts
const emailSwitch = adminPage.locator('button[role="switch"]').first(); // Which switch?
```

**Why it's bad:**

- Breaks when UI changes
- `.first()` is non-specific (could grab wrong element)
- Parent traversal `..` is fragile
- Hard to debug failures

**A-Grade Solution:**

```typescript
// Add data-testid attributes to components
<a href="/new" data-testid="buy-membership-link">Buy</a>
<button data-testid="expand-member-row-{member.id}">Expand</button>
<Switch data-testid="email-consent-toggle" />

// Tests become robust
const buyLink = adminPage.getByTestId("buy-membership-link");
const expandButton = adminPage.getByTestId(`expand-member-row-${member.id}`);
const emailSwitch = adminPage.getByTestId("email-consent-toggle");
```

**Impact:** 🔴 **BLOCKS A-GRADE**

---

#### 3. **No External Service Mocking** - CRITICAL

**Current Problem:**

```typescript
// Tests hit REAL Stripe API
await authenticatedPage.click('button[type="submit"]');
await expect(authenticatedPage).toHaveURL(/checkout\.stripe\.com/); // Real redirect!

// No email verification
// User gets OTP email, but we never verify it was sent correctly
```

**Why it's bad:**

- Tests depend on external services being available
- Can't test error scenarios (Stripe API down, email fails)
- Slow (network calls)
- Costs money (Stripe API calls)
- Can't verify email content

**A-Grade Solution:**

```typescript
// Mock Stripe in tests
import { mockStripe } from "./fixtures/stripe-mock";

test("purchase flow with Stripe error", async ({ page }) => {
	await mockStripe.mockCheckoutSessionCreate({
		error: "card_declined",
	});

	// Now we can test error handling
	await page.click('button[type="submit"]');
	await expect(page.getByText("Payment failed")).toBeVisible();
});

// Spy on email sending
import { emailSpy } from "./fixtures/email-spy";

test("sign-in sends OTP email", async ({ page }) => {
	await page.fill('input[type="email"]', "test@example.com");
	await page.click('button[type="submit"]');

	expect(emailSpy).toHaveBeenCalledWith({
		to: "test@example.com",
		subject: expect.stringContaining("OTP"),
		body: expect.stringMatching(/\d{6}/), // Contains 6-digit code
	});
});
```

**Impact:** 🔴 **BLOCKS A-GRADE**

---

#### 4. **Limited Error Scenario Coverage** - HIGH PRIORITY

**Current Problem:**
We only test happy paths. Missing:

- ❌ What if Stripe API is down?
- ❌ What if database connection fails?
- ❌ What if user has slow network?
- ❌ What if webhook arrives twice (despite our duplicate check)?
- ❌ What if form has validation errors?

**A-Grade Solution:**

```typescript
test("handles Stripe API timeout gracefully", async ({ page }) => {
	await mockStripe.mockTimeout();

	await page.click('button[type="submit"]');

	// Should show error, not crash
	await expect(page.getByText(/try again|error/i)).toBeVisible();
	// User should still be able to retry
	await expect(page.locator('button[type="submit"]')).toBeEnabled();
});

test("handles database connection failure", async ({ adminPage }) => {
	// Simulate DB down
	await db.close();

	await adminPage.goto("/admin/members");

	// Should show error page, not white screen
	await expect(adminPage.getByText(/unavailable|error/i)).toBeVisible();
});

test("form validation prevents invalid data", async ({ adminPage }) => {
	await adminPage.fill('input[name="priceCents"]', "-100"); // Negative price
	await adminPage.click('button[type="submit"]');

	// Should show validation error
	await expect(adminPage.getByText(/positive number|invalid/i)).toBeVisible();
	// Should not save to database
	const membership = await db.query.membership.findFirst({
		where: eq(table.membership.priceCents, -100),
	});
	expect(membership).toBeUndefined();
});
```

**Impact:** 🟡 **HIGH PRIORITY**

---

### 🟡 **Important Gaps** (Improve quality)

#### 5. **No Performance/Load Testing**

**What's missing:**

- How does admin members list perform with 10,000 members?
- What happens with 100 concurrent webhook deliveries?
- Does pagination work with realistic data?

**A-Grade Solution:**

```typescript
test("admin members list handles 1000+ members", async ({ adminPage }) => {
	// Create 1000 test members
	await testData.createMembers(1000);

	const startTime = Date.now();
	await adminPage.goto("/admin/members");
	const loadTime = Date.now() - startTime;

	// Page should load in < 2 seconds
	expect(loadTime).toBeLessThan(2000);

	// Pagination should work
	await expect(adminPage.getByText("1-50 of 1000")).toBeVisible();
});

test("handles concurrent webhook deliveries", async () => {
	// Send 100 webhooks simultaneously
	const webhooks = Array(100)
		.fill(null)
		.map((_, i) => sendTestWebhook(`cs_test_${i}`));

	await Promise.all(webhooks);

	// All should process successfully
	const failedWebhooks = await db.query.webhookLog.findMany({
		where: eq(table.webhookLog.status, "failed"),
	});
	expect(failedWebhooks.length).toBe(0);
});
```

**Impact:** 🟡 **IMPORTANT**

---

#### 6. **No Accessibility Testing**

**What's missing:**

- Keyboard navigation
- Screen reader compatibility
- ARIA labels
- Color contrast
- Focus management

**A-Grade Solution:**

```typescript
import { injectAxe, checkA11y } from "axe-playwright";

test("profile page is accessible", async ({ page }) => {
	await page.goto("/");
	await injectAxe(page);

	// Check for accessibility violations
	const violations = await checkA11y(page);
	expect(violations).toHaveLength(0);
});

test("keyboard navigation works", async ({ page }) => {
	await page.goto("/new");

	// Tab through form
	await page.keyboard.press("Tab");
	await expect(page.locator(":focus")).toHaveAttribute("name", "membershipId");

	await page.keyboard.press("Space"); // Select radio
	await expect(page.locator('input[name="membershipId"]:checked')).toBeVisible();

	await page.keyboard.press("Tab");
	await page.keyboard.press("Enter"); // Submit

	// Should navigate to Stripe
	await expect(page).toHaveURL(/checkout\.stripe\.com/);
});
```

**Impact:** 🟡 **IMPORTANT** (especially for government/accessibility requirements)

---

#### 7. **Test Isolation Issues**

**Current Problem:**

```typescript
// Tests can interfere with each other
test("creates member", async () => {
	await db.insert(table.member).values({ email: "test@example.com" });
	// If this test fails, cleanup doesn't run
	// Next test that tries to create same email will fail
});

test("updates member", async () => {
	// Assumes member from previous test exists
	// If run in isolation, this test fails
});
```

**A-Grade Solution:**

```typescript
// Use test fixtures with automatic cleanup
test("creates member", async ({ testData }) => {
  const member = await testData.createMember({
    email: "test@example.com"
  });

  // Test logic...

  // Automatic cleanup after test, even if it fails
});

// Or use database transactions
test("updates member", async ({ db }) => {
  await db.transaction(async (tx) => {
    // All changes in this test are rolled back automatically
    const member = await tx.insert(table.member).values({...});
    // Test logic...
  });
  // Transaction rolled back, DB is clean
});
```

**Impact:** 🟡 **IMPORTANT**

---

### 🟢 **Nice-to-Have** (Polish for A+)

#### 8. **Visual Regression Testing**

Test that UI doesn't change unexpectedly:

```typescript
test("profile page visual regression", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveScreenshot("profile-page.png");
});
```

#### 9. **API Contract Testing**

Verify Stripe API hasn't changed:

```typescript
test("Stripe session schema is stable", async () => {
  const session = await stripe.checkout.sessions.create({...});

  // Verify expected fields exist
  expect(session).toHaveProperty("id");
  expect(session).toHaveProperty("payment_status");
  expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com/);
});
```

#### 10. **Better Test Reporting**

- Generate HTML test reports
- Track test trends over time
- Slack notifications for failures

---

## Priority Roadmap: B+ → A

### **Phase 1: CRITICAL (Required for A-grade)** ⏱️ 4-6 hours

1. **Test Data Fixtures** (2 hours)
   - Create `testData` fixture with helper functions
   - `createUser()`, `createMember()`, `createMembership()`
   - Automatic cleanup with try/finally
   - Impact: Fixes test isolation, enables parallel execution

2. **Robust Selectors** (2 hours)
   - Add `data-testid` to all interactive elements
   - Replace `.first()`, `..`, `button:has(svg)` with testIds
   - Impact: Tests won't break when UI changes

3. **Mock External Services** (2 hours)
   - Mock Stripe API for tests
   - Spy on email sending
   - Impact: Fast, reliable, testable error scenarios

---

### **Phase 2: HIGH PRIORITY (Solidify A-grade)** ⏱️ 3-4 hours

4. **Error Scenario Testing** (2 hours)
   - Stripe API errors
   - Form validation errors
   - Database timeouts
   - Impact: Confidence in error handling

5. **Performance Testing** (1-2 hours)
   - Test with 1000+ members
   - Concurrent webhook handling
   - Impact: Catches performance regressions

---

### **Phase 3: POLISH (A → A+)** ⏱️ 2-3 hours

6. **Accessibility Testing** (1-2 hours)
7. **Visual Regression** (30 min)
8. **Better Reporting** (1 hour)

---

## Concrete Implementation Plan

### **Step 1: Test Data Fixture** (HIGHEST IMPACT)

Create `e2e/fixtures/test-data.ts`:

```typescript
import { test as base } from "@playwright/test";
import { db } from "../../src/lib/server/db";
import * as table from "../../src/lib/server/db/schema";

type TestData = {
	createUser(data?: Partial<User>): Promise<User>;
	createMember(data?: Partial<Member>): Promise<Member>;
	createMembership(data?: Partial<Membership>): Promise<Membership>;
	cleanup(): Promise<void>;
};

export const test = base.extend<{ testData: TestData }>({
	testData: async ({}, use) => {
		const created: string[] = [];

		const testData: TestData = {
			async createUser(data = {}) {
				const user = await db
					.insert(table.user)
					.values({
						id: crypto.randomUUID(),
						email: `test-${Date.now()}@example.com`,
						isAdmin: false,
						...data,
					})
					.returning();

				created.push(`user:${user[0].id}`);
				return user[0];
			},

			async createMember(data = {}) {
				const member = await db
					.insert(table.member)
					.values({
						id: crypto.randomUUID(),
						userId: data.userId || (await this.createUser()).id,
						membershipId: data.membershipId || (await this.createMembership()).id,
						status: "awaiting_approval",
						stripeSessionId: `cs_test_${Date.now()}`,
						...data,
					})
					.returning();

				created.push(`member:${member[0].id}`);
				return member[0];
			},

			async createMembership(data = {}) {
				const membership = await db
					.insert(table.membership)
					.values({
						id: crypto.randomUUID(),
						type: `Test ${Date.now()}`,
						stripePriceId: `price_test_${Date.now()}`,
						startTime: new Date("2025-01-01"),
						endTime: new Date("2025-12-31"),
						priceCents: 1000,
						requiresStudentVerification: false,
						...data,
					})
					.returning();

				created.push(`membership:${membership[0].id}`);
				return membership[0];
			},

			async cleanup() {
				// Cleanup in reverse order (members before users)
				for (const id of created.reverse()) {
					const [type, uuid] = id.split(":");
					if (type === "member") {
						await db.delete(table.member).where(eq(table.member.id, uuid));
					} else if (type === "user") {
						await db.delete(table.user).where(eq(table.user.id, uuid));
					} else if (type === "membership") {
						await db.delete(table.membership).where(eq(table.membership.id, uuid));
					}
				}
			},
		};

		await use(testData);

		// Automatic cleanup after test
		await testData.cleanup();
	},
});
```

**Usage:**

```typescript
import { test } from "./fixtures/test-data";

test("admin approves member", async ({ adminPage, testData }) => {
	// Create fresh test data
	const member = await testData.createMember({
		status: "awaiting_approval",
	});

	await adminPage.goto("/admin/members");
	// Find by specific data, not "first" or "root@tietokilta.fi"
	const row = adminPage.getByTestId(`member-row-${member.id}`);
	await row.getByTestId("approve-button").click();

	// Verify
	const updated = await db.query.member.findFirst({
		where: eq(table.member.id, member.id),
	});
	expect(updated?.status).toBe("active");

	// Automatic cleanup, no manual deletion needed
});
```

**Impact:**

- ✅ Tests are isolated
- ✅ Can run in parallel
- ✅ No test interdependence
- ✅ Reproducible failures

---

### **Step 2: Robust Selectors**

Update components to add `data-testid`:

**src/routes/(app)/+page.svelte:**

```svelte
<button type="submit" data-testid="save-profile-button">
	{$LL.user.save()}
</button>

<Switch data-testid="email-consent-toggle" bind:checked={isAllowedEmails} />

<a href="/new" data-testid="buy-membership-link">
	{$LL.membership.buy()}
</a>
```

**src/routes/admin/members/+page.svelte:**

```svelte
{#each members as member}
	<TableRow data-testid="member-row-{member.id}">
		<button data-testid="expand-member-{member.id}">...</button>

		{#if expanded}
			<form action="?/approve" data-testid="approve-form-{member.id}">
				<button type="submit" data-testid="approve-button-{member.id}"> Approve </button>
			</form>
		{/if}
	</TableRow>
{/each}
```

**Update tests:**

```typescript
// Before: Fragile
const buyLink = page.locator('a[href*="/new"]').first();
const expandButton = row.locator("..").locator("button:has(svg)").first();

// After: Robust
const buyLink = page.getByTestId("buy-membership-link");
const expandButton = page.getByTestId(`expand-member-${member.id}`);
```

---

### **Step 3: Mock Stripe API**

Create `e2e/fixtures/stripe-mock.ts`:

```typescript
import { test as base } from "@playwright/test";

export const test = base.extend({
	async context({ context }, use) {
		// Intercept Stripe API calls
		await context.route("https://api.stripe.com/**", (route) => {
			const url = route.request().url();

			if (url.includes("/v1/checkout/sessions")) {
				// Mock session creation
				route.fulfill({
					status: 200,
					body: JSON.stringify({
						id: `cs_test_mock_${Date.now()}`,
						url: "https://checkout.stripe.com/mock",
						payment_status: "unpaid",
					}),
				});
			} else {
				route.continue();
			}
		});

		await use(context);
	},
});
```

**Usage:**

```typescript
test("handles Stripe API error", async ({ page }) => {
	// Mock Stripe error
	await page.route("https://api.stripe.com/**", (route) => {
		route.fulfill({
			status: 500,
			body: JSON.stringify({ error: { message: "API Error" } }),
		});
	});

	await page.click('button[type="submit"]');

	// Should show error to user
	await expect(page.getByText(/error|failed/i)).toBeVisible();
});
```

---

## Summary: B+ → A Checklist

### **Must-Have for A-grade:**

- [ ] Test data fixtures with automatic cleanup
- [ ] Replace all fragile selectors with data-testid
- [ ] Mock Stripe API in tests
- [ ] Spy on email sending
- [ ] Test error scenarios (API down, validation errors)
- [ ] Performance testing with realistic data

### **Effort:**

- Phase 1 (Critical): 4-6 hours → **Gets you to A-grade**
- Phase 2 (Polish): 3-4 hours → **Solidifies A-grade**
- Phase 3 (A+): 2-3 hours → **Excellence**

### **ROI:**

- **Test reliability:** 85% → 98%
- **Test speed:** 3-4 min → 1-2 min (no external API calls)
- **Test maintenance:** Robust selectors mean UI changes don't break tests
- **Production confidence:** 85% → 95%+

---

## Next Steps

Want me to implement:

1. **Test data fixtures** (biggest impact, enables everything else)
2. **Add data-testid to components** (makes tests unbreakable)
3. **Mock Stripe API** (enables error scenario testing)

Or all three? This would take us from **B+ → A** in one implementation session.
