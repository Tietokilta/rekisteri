# E2E Test Review & Improvement Plan

## Testing Philosophy

**Good E2E tests should:**

1. ✅ Test user journeys, not implementation details
2. ✅ Use stable selectors (roles, labels, test IDs)
3. ✅ Act as living documentation/requirements
4. ✅ Cover critical paths and edge cases
5. ✅ Verify actual behavior, not just UI existence
6. ✅ Be maintainable and readable

## Current Test Analysis

### membership-purchase.test.ts (6 tests)

**Issues:**

- ❌ Tests 1-2: Too basic - just check elements exist
- ❌ Test 3-4: Duplicative - both test student verification
- ⚠️ Test 5: Implementation detail (price in button text)
- ✅ Test 6: Good - tests access control

**Recommendations:**

- CONSOLIDATE: Merge tests 3-4 into one comprehensive student verification test
- REMOVE: "user can select a membership option" - trivial
- IMPROVE: Add test verifying membership details (price, dates) are displayed
- KEEP: Access control test

**Improved count: 3-4 meaningful tests**

---

### admin-memberships.test.ts (8 tests)

**Issues:**

- ❌ Tests 1-3: Check UI exists, don't verify functionality
- ❌ Test 4: Checks HTML5 validation, doesn't test form submission
- ❌ Test 5: Fills form but doesn't submit - no value
- ✅ Test 6: Good - tests business rule (can delete empty memberships)
- ✅ Test 7: Good - tests access control
- ⚠️ Test 8: Minor - datalist is implementation detail

**Critical Missing Tests:**

- 🚨 NO TEST for actually creating a membership
- 🚨 NO TEST for actually deleting a membership
- 🚨 NO TEST for server-side validation errors

**Recommendations:**

- ADD: Test creating a new membership (full flow with DB verification)
- ADD: Test deleting an empty membership
- ADD: Test validation errors (empty fields, invalid dates, etc.)
- REMOVE: Tests 1-5, 8 - check structure, not behavior
- KEEP: Tests 6-7

**Improved count: 4-5 meaningful tests**

---

### admin-members.test.ts (12 tests!)

**Issues:**

- ❌ Tests 1, 5-7, 10-11: Check UI elements exist
- ❌ Tests 2-4: Check filter UI exists, DON'T verify filtering works
- ❌ Test 8: Checks expansion UI, not functionality
- ❌ Test 9: Checks copy button exists, not that copy works
- ⚠️ Test 12: Good concept but checks URL, not actual filtering

**Critical Missing Tests:**

- 🚨 NO TEST verifying search actually filters results
- 🚨 NO TEST verifying filters actually filter results
- 🚨 NO TEST for member actions (approve, reject, cancel, reactivate)
- 🚨 NO TEST verifying member details are correct

**Recommendations:**

- ADD: Test searching for member by name returns correct result
- ADD: Test filtering by status shows only matching members
- ADD: Test approving a pending member changes their status
- ADD: Test rejecting a member removes them
- REMOVE: All tests that just check UI exists (1-11)
- KEEP: Test 12 (but improve to verify actual filtering)

**Improved count: 5-6 meaningful tests**

---

### user-profile.test.ts (15 tests!!!)

**Issues:**

- ❌ Tests 1-13: Check individual fields/buttons exist
- ❌ Tests check you CAN TYPE but never verify SAVING
- ❌ Multiple redundant tests for same concept

**Critical Missing Tests:**

- 🚨 NO TEST for actually saving profile changes
- 🚨 NO TEST verifying saved data persists
- 🚨 NO TEST for validation errors
- 🚨 NO TEST for sign-out functionality

**Recommendations:**

- ADD: Test updating profile (name, municipality, email consent) and verifying changes persist
- ADD: Test validation (required fields, etc.)
- ADD: Test sign-out redirects to sign-in
- ADD: Test admin vs non-admin view differences
- REMOVE: Tests 2-13 - just check fields exist
- KEEP: Tests 1, 14 (access control, admin sections)

**Improved count: 5-6 meaningful tests**

---

### navigation.test.ts (15 tests)

**Issues:**

- ❌ Multiple redundant tests for "redirect to sign-in"
- ❌ Loop-based tests (fragile, unclear which iteration fails)
- ❌ Tests check headings exist (implementation detail)
- ⚠️ Tests 1-4: Good user flows but could be combined

**Recommendations:**

- CONSOLIDATE: Tests 5-7, 11 all test unauthenticated redirect - merge into ONE
- REMOVE: Tests 8, 13, 14 - check implementation details
- KEEP: Tests 1-4 (admin navigation), 9 (language switch)
- IMPROVE: Test 10 - check admin can see admin-only content, not just navigate

**Improved count: 6-7 meaningful tests**

---

## Summary

**Current: 56 tests**

- Many check "UI exists" without verifying behavior
- Many are redundant or trivial
- Missing critical flows (create, update, delete, state changes)
- Too implementation-specific (fragile selectors)

**Improved: ~25-30 tests**

- Each test verifies meaningful user value
- Cover critical paths and edge cases
- Act as living requirements
- Stable and maintainable

---

## Key Improvements Needed

### 1. Add Missing Critical Tests

- ✅ Create membership (admin-memberships)
- ✅ Delete membership (admin-memberships)
- ✅ Save profile changes (user-profile)
- ✅ Approve/reject member (admin-members)
- ✅ Verify filtering works (admin-members)
- ✅ Sign out (user-profile)

### 2. Remove Low-Value Tests

- ❌ Tests that just check elements exist
- ❌ Tests that check you can type in a field
- ❌ Redundant access control tests
- ❌ Implementation-specific UI checks

### 3. Consolidate Redundant Tests

- Merge similar tests (e.g., all "redirect to sign-in" tests)
- Combine setup code where possible
- One test per user flow/requirement

### 4. Improve Test Quality

- Use semantic selectors (getByRole, getByLabel)
- Add clear test descriptions that read like requirements
- Verify state changes, not just UI
- Test edge cases and error states

---

## Next Steps

1. Review this analysis with team
2. Prioritize which tests to keep/add/remove
3. Implement improvements incrementally
4. Consider adding `data-testid` attributes for stable selectors
5. Add tests for webhooks, email sending, scheduled jobs (if needed)
