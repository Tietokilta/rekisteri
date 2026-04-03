# Membership Model Redesign

## Problem

The current membership data model is based on kide.app's periodic structure: each membership is a time-bounded period that users "buy into" each year. This does not reflect Finnish association law, where membership is indefinite ("toistaiseksi") with periodic payment obligations. The mismatch causes:

- Old membership periods display "Eronnut" (resigned) when the member simply renewed
- The system treats renewals as new applications, requiring unnecessary approval flows
- The data model cannot distinguish "didn't pay this year" from "formally resigned"
- Auto-approval logic adds complexity to work around the periodic model's limitations

## Context

### Legal basis

Per Finnish association law and Tietokilta's bylaws (saannot):

- **Membership is indefinite** until explicitly resigned or terminated (SS8-9)
- **Payment is an annual obligation** — the annual meeting (vuosikokous) sets fees per member category (SS7)
- **Non-payment resignation** — the board may deem a member resigned if payment is overdue by 2 months (SS8 p2)
- **Voluntary resignation** — written notice to the board (SS8 p1)
- **Board approval** — required for new memberships (SS26)

Other guilds (Fyysikkokilta, AS) follow the same pattern with minor differences (grace periods, which types pay).

### Current state

The system is in production with imported data from kide.app. Approximately 3000 member records exist. The `claude/email-system-phase-2-QKOem` branch (not yet merged) adds payment reminders — it will be reimplemented on top of the new model.

### Goals

1. Align the data model with legal reality (indefinite membership + periodic payments)
2. Preserve import compatibility with kide.app CSV data
3. Simplify the renewal flow for active members (just a payment, no approval)
4. Support order-independent, idempotent imports

### Non-goals

- Multi-tenancy (shared database for multiple guilds) — each deployment is single-tenant
- Organization settings UI (hardcoded defaults for now, configurable settings planned separately)
- Automatic status changes (all status transitions remain manual admin actions)
- Auto-approval logic (removed entirely, can be revisited later)
- Honorary member management UI (can be managed manually via admin for now)

## Schema Design

### `membershipType` (modified)

| Column                      | Type                    | Notes                                                                   |
| --------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| id                          | TEXT PK                 | e.g., "varsinainen-jasen"                                               |
| name                        | JSONB (LocalizedString) | Display name (fi/en)                                                    |
| description                 | JSONB (LocalizedString) | Optional description                                                    |
| purchasable                 | BOOLEAN                 | Controls if users can buy via Stripe                                    |
| requiresStudentVerification | BOOLEAN                 | **Moved from membershipPeriod.** If true, requires valid aalto.fi email |
| createdAt, updatedAt        | TIMESTAMP               | Standard timestamps                                                     |

Changes: `requiresStudentVerification` moved here from the period table, since it is a property of the membership type, not a yearly configuration.

### `membershipPeriod` (renamed from `membership`)

| Column           | Type                          | Notes                                                             |
| ---------------- | ----------------------------- | ----------------------------------------------------------------- |
| id               | TEXT PK                       |                                                                   |
| membershipTypeId | TEXT FK -> membershipType     |                                                                   |
| startDate        | DATE                          | Precise start (e.g., 2024-08-01)                                  |
| endDate          | DATE                          | Precise end (e.g., 2025-07-31)                                    |
| dueDate          | DATE                          | Payment due date (e.g., 2024-09-30). Nullable for legacy periods. |
| stripePriceId    | TEXT                          | Nullable for legacy/free periods                                  |
| UNIQUE           | (membershipTypeId, startDate) | One period per type per start date                                |

The year is derived from `startDate` when needed for display or import matching — no separate column. Precise dates are set by the admin when creating periods (pre-filled from hardcoded defaults), and derived automatically during import.

Hardcoded defaults (Tietokilta): period start August 1, period end July 31, due date September 30. These will be made configurable via an organization settings page in a future issue.

### `member` (restructured)

| Column               | Type                        | Notes                                                           |
| -------------------- | --------------------------- | --------------------------------------------------------------- |
| id                   | TEXT PK                     |                                                                 |
| userId               | TEXT FK -> user             | Null for organization members                                   |
| organizationName     | TEXT                        | Null for individual members                                     |
| membershipTypeId     | TEXT FK -> membershipType   | The type of membership                                          |
| status               | ENUM                        | awaiting_payment, awaiting_approval, active, resigned, rejected |
| joinedAt             | TIMESTAMP                   | When the membership relationship started                        |
| resignedAt           | TIMESTAMP                   | When resigned. Null if not resigned.                            |
| description          | TEXT                        | Resignation reason, application motive, etc.                    |
| createdAt, updatedAt | TIMESTAMP                   | Standard timestamps                                             |
| CHECK                | userId XOR organizationName | Must have one or the other                                      |

Key changes from current model:

- `membershipId` FK removed — member is no longer tied to a specific period
- `membershipTypeId` FK added — member is tied to a type directly
- `joinedAt` and `resignedAt` added for history tracking
- `stripeSessionId` removed (moved to `payment`)

Multiple rows per user are allowed:

- Different types concurrently (though only one can be `active` at a time)
- Same type if resigned and re-joined (each "chapter" is a separate row)

**Database constraint:** A partial unique index enforces at most one active membership per user (regardless of type):

```sql
CREATE UNIQUE INDEX one_active_per_user
  ON member (userId)
  WHERE status = 'active';
```

### `payment` (new)

| Column               | Type                           | Notes                                                        |
| -------------------- | ------------------------------ | ------------------------------------------------------------ |
| id                   | TEXT PK                        |                                                              |
| memberId             | TEXT FK -> member              | Which membership relationship                                |
| membershipPeriodId   | TEXT FK -> membershipPeriod    | Which period this payment covers                             |
| source               | ENUM                           | `imported`, `stripe`, `manual`                               |
| paidAt               | TIMESTAMP                      | When payment was completed. **Null = checkout in progress.** |
| stripeSessionId      | TEXT                           | Stripe checkout session ID. Null for non-Stripe.             |
| createdAt, updatedAt | TIMESTAMP                      | Standard timestamps                                          |
| UNIQUE               | (memberId, membershipPeriodId) | One payment per member per period                            |

The `paidAt = null` state is used during active Stripe checkout sessions. This enables the resume flow: if a user navigates away and returns, the existing Stripe session can be resumed. Stale incomplete payments (e.g., older than 24h) are cleaned up periodically.

## Status Transitions

### Member statuses

| Status            | Meaning                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| awaiting_payment  | New member applied, hasn't paid yet                                              |
| awaiting_approval | New member paid, waiting for board decision (SS26)                               |
| active            | Board-approved, ongoing membership                                               |
| resigned          | No longer a member — voluntary (SS8 p1), non-payment (SS8 p2), or expelled (SS9) |
| rejected          | Board rejected application, or payment failed/expired                            |

### Valid transitions

```
awaiting_payment  -> awaiting_approval  (Stripe payment succeeded)
awaiting_payment  -> rejected           (Stripe payment failed/expired)
awaiting_approval -> active             (board approves)
awaiting_approval -> rejected           (board rejects)
active            -> resigned           (admin action: voluntary, non-payment, or expulsion)
```

Re-joining after resignation or rejection always creates a **new member row** with the full application flow (`awaiting_payment -> awaiting_approval -> active`). There is no transition from resigned/rejected back to active on the same row.

### What triggers resignation

All resignations are manual admin actions, never automatic:

- **Voluntary resignation (SS8 p1)** — member requests it, admin marks resigned
- **Non-payment (SS8 p2)** — bulk admin action after board meeting, typically ~2 months after due date
- **Expulsion (SS9)** — board decision for misconduct

## Purchase Flows

### Path A: New member applying (or re-joining after resignation)

1. User picks membership type on `/new` page
2. Fills in required info (description/motive, student verification if needed)
3. `member` row created with status `awaiting_payment`
4. `payment` row created with `paidAt = null`, `stripeSessionId` set
5. User redirected to Stripe checkout
6. Stripe succeeds -> `payment.paidAt` set, member status -> `awaiting_approval`
7. Board approves -> member status -> `active`

If Stripe fails/expires: member -> `rejected`, stale payment row cleaned up.

If the user tries to apply again later: reuse an existing `awaiting_payment` member row for the same user+type rather than creating a new one. `rejected` rows are kept as historical records (rare — represents an actual board decision).

### Path B: Active member paying dues

1. Admin creates `membershipPeriod` for upcoming year (with Stripe price)
2. Active members see "Payment due for [year]" in UI
3. Member clicks pay -> `payment` row created (`paidAt = null`, `stripeSessionId` set)
4. Stripe succeeds -> `payment.paidAt` set. **Member status unchanged, stays `active`.**
5. If Stripe fails/expires -> stale payment row cleaned up. Member can retry.

No member status changes. No approval needed. Just a payment.

### Path C: Admin manually adding a member

1. Admin creates `member` row directly with `active` or `awaiting_approval` status
2. Optionally creates a `payment` row with `source: manual`
3. Used for honorary members (no payment needed), cash payments, or edge cases

### Path D: Honorary / free members

1. Admin creates `member` row with status `active`
2. Membership type has `purchasable = false`, no periods with Stripe prices
3. Never appears in "payment due" lists. No payments needed. Indefinite.

## Import Logic

### CSV format

```csv
firstNames,lastName,homeMunicipality,email,membershipTypeId,year
Testi,Henkilö,Helsinki,testi@aalto.fi,varsinainen-jasen,2020
Testi,Henkilö,Helsinki,testi@aalto.fi,varsinainen-jasen,2021
Testi,Henkilö,Helsinki,testi@aalto.fi,varsinainen-jasen,2022
Testi,Henkilö,Helsinki,testi@aalto.fi,alumnijasen,2023
```

The `year` column replaces the previous `membershipStartDate`. If a full date is provided, the year is extracted (backward compatible with existing kide.app exports).

### Algorithm

The entire import runs within a **database transaction**. The same logic supports two modes:

- **Dry run (preview)**: executes within a transaction, computes the diff, then rolls back. Returns the preview of changes to the admin for review.
- **Commit**: executes within a transaction and commits on success.

Steps:

1. **Parse and validate** all CSV rows
2. **Find or create users** by email (latest row wins for profile fields, same as current)
3. **Find or create `membershipPeriod` rows** by (membershipTypeId, year) — dates derived from hardcoded organization defaults (period start: Aug 1, period end: Jul 31, due date: Sept 30)
4. **Find or create `payment` rows** with `source: imported` for each (user, period) pair
5. **Re-derive member rows** for each affected (user, membershipType) pair:

#### Member row re-derivation (step 5)

For each affected (user, membershipType):

1. **Collect** all imported payments (where `source = imported`), sorted by period start year
2. **Delete** all existing member rows that have **only** `source: imported` payments (protect system-created rows)
3. **Detect continuous chains**: consecutive years with no gap form one chain
   - Example: 2020, 2021, 2022 = one chain
   - Example: 2020, 2021, [gap], 2024, 2025 = two chains
4. **Create** a new `member` row for each chain:
   - `joinedAt` = startDate of the first year's period
   - If the chain covers the current period (i.e., today falls within the last year's period endDate or later — the member has not had a gap): `status = active`, `resignedAt = null`
   - If the chain does not cover the current period: `status = resigned`, `resignedAt` = endDate of the last year's period
5. **Link payments** to their respective member rows

This re-derivation approach is simpler than incremental merging: delete imported member rows, re-create from scratch based on all known imported payments. Since it runs in a transaction, no data is lost on failure.

#### Conflict detection

Before deleting an imported-only member row, compare its current status with what the payment chain would derive. If they differ (e.g., an admin manually resigned an imported member, but payments say they should be active), the import **blocks with an error** listing the conflicting users. The admin or IT resolves the conflict manually before re-importing. This prevents the import from silently overwriting manual admin actions.

#### Mixed source protection

Member rows that have **any** `source: stripe` or `source: manual` payment are never deleted or modified by import. Import creates separate member rows for imported data. This ensures production data created through the live system is never altered by imports.

#### Type transitions

If the same user has varsinainen-jasen for 2020-2022 and alumnijasen for 2023-2025, these are two separate member rows (different types). The varsinainen row gets `status: resigned` with `resignedAt` at the end of the 2022 period.

### Order independence

The re-derivation step rebuilds the complete picture on every import run. This guarantees convergence regardless of import order:

| Import order     | Final state                                |
| ---------------- | ------------------------------------------ |
| 2023, 2024, 2025 | 1 member (joined 2023, active), 3 payments |
| 2025, 2023, 2024 | same                                       |
| 2024, 2025, 2023 | same                                       |

Gap-filling across separate imports:

| Import sequence               | Final state                                            |
| ----------------------------- | ------------------------------------------------------ |
| First: 2020, 2021, 2024, 2025 | 2 members: (2020-2021, resigned) + (2024-2025, active) |
| Then: 2022, 2023              | 1 member: (2020-2025, active), 6 payments              |

### Source derivation for existing production data

Existing data can be classified retroactively during migration:

- **Payments**: no `stripeSessionId` -> `source: imported`; has `stripeSessionId` -> `source: stripe`
- **Users**: no verified email + no `lastActiveAt` -> imported placeholder user

For future imports (including by other guilds), the import flow explicitly sets `source: imported` on all created records.

## Production Data Migration

### Step 1: Schema changes

In a single migration:

1. Rename `membership` table to `membershipPeriod`
2. Add `dueDate` column to `membershipPeriod` (set to September 30 of start year for Tietokilta)
3. Move `requiresStudentVerification` from `membershipPeriod` to `membershipType`
4. Restructure `member` table: add `membershipTypeId`, `joinedAt`, `resignedAt`; drop `membershipId` after data migration
5. Create `payment` table

### Step 2: Data migration

1. For each existing `member` row, create a `payment` row:
   - `membershipPeriodId` = existing `membershipId`
   - `source` = `imported` if no `stripeSessionId`, `stripe` otherwise
   - `paidAt` = existing `createdAt` (best available approximation)
   - `stripeSessionId` = copied from existing member row

2. Run the same re-derivation algorithm as import (step 5 above) to derive the new member rows from the complete set of payments per (user, membershipType).

### Step 3: Validate

- Verify total payment count matches old member row count
- Verify every user's membership history is preserved
- Verify active members are correctly identified
- Spot-check specific known users

This is a one-shot migration with no intermediate state. Old columns are dropped in the same migration after data is moved.

## Admin Actions

### Individual actions

| Action         | Status change                                  | Notes                                          |
| -------------- | ---------------------------------------------- | ---------------------------------------------- |
| Approve member | awaiting_approval -> active                    | Board decision                                 |
| Reject member  | awaiting_payment/awaiting_approval -> rejected | Board decision                                 |
| Mark resigned  | active -> resigned                             | Sets resignedAt, records reason in description |
| Create member  | -> active or awaiting_approval                 | Manual add (honorary, cash payment, etc.)      |

### Bulk actions

| Action                      | Notes                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Bulk approve                | Approve multiple awaiting_approval members at once                                          |
| Bulk resign for non-payment | Mark multiple active members as resigned. Used after board meeting ~2 months past due date. |

### Removed

- **Auto-approval** — removed entirely. Active members don't need approval to pay dues. New/re-joining members always go through board approval.
- **Reactivate** — removed. Re-joining creates a new member row instead.

## Test Plan

### Import order independence

All permutations of these imports must converge to the same final state:

- 3 consecutive years (e.g., 2023, 2024, 2025) in every possible order (6 permutations)
- Years with gaps (e.g., 2020, 2021, 2024, 2025) in every possible order
- Gap-filling: import with gap first, then fill the gap in a second import
- All permutations should produce identical member rows and payment records

### Import edge cases

- Same CSV imported twice -> no duplicates (idempotency)
- Type transition: varsinainen 2020-2022, alumni 2023-2025 -> two member rows
- Multi-email: same person with different emails -> separate users (admin merges later)
- Organization members: import without userId
- Backward compatible: CSV with full dates instead of year -> year extracted
- Dry run returns accurate preview without modifying data

### Mixed source scenarios

- User paid 2025 via Stripe, then import adds 2020-2024 -> system member row untouched, historical imported member row created separately
- User was imported, then pays next period via Stripe -> payment added to existing member row with source: stripe
- Import after system usage: imported data never modifies system-created member rows

### Purchase flows

- New member: full flow from application to approval
- Active member paying dues: payment only, no status change
- Resume checkout: navigate away, return, resume same Stripe session
- Failed checkout: stale payment cleanup
- Re-joining after resignation: new member row created, old history preserved

### Status transitions

- All valid transitions work correctly
- Invalid transitions are rejected
- Bulk resign sets resignedAt and records reason
- No automatic status changes occur anywhere

### Migration

- Existing production data migrates correctly
- Payment count matches old member row count
- Active members correctly identified
- Stripe-paid members have source: stripe on payments
- Member history timeline is accurate for known test users
