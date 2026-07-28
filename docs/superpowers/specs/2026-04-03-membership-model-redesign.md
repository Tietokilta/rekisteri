# Membership Model Redesign

## Decision summary

Legal membership is indefinite. A yearly fee is an obligation attached to an
already-existing membership, not a new membership chapter.

The redesigned model therefore separates five facts:

1. `member` is the current legal snapshot for one person or organization.
2. `membershipEvent` is the durable history of legal membership decisions.
3. `membershipFeePeriod` defines one type's fee and deadlines for a period.
4. `membershipObligation` records that a particular member was issued that fee.
5. `payment` records money and payment attempts.

This is deliberately not full event sourcing. Current lists read the `member`
snapshot; history reads immutable domain events. Payments remain their own
financial records.

## Context

### Problem

The current model copies kide.app: a membership is a product with start and end
times that a user buys each year. This creates false membership chapters,
displays old periods as resignations, and sends renewals through an application
approval flow.

That model does not match Tietokilta's rules:

- Membership continues until it is ended under sections 8 or 9.
- The annual meeting sets fees by membership category under section 7.
- The board may deem a member resigned after the fee has been overdue for two
  months, but non-payment does not itself end membership.
- A new member requires the board decision described in section 25(4).

Other associations have different fee categories and deadlines, but the same
separation between legal membership and fees is broadly useful.

### Current state

The production database contains roughly 3,000 old period-shaped member rows,
including data imported from kide.app and rows created by the live Stripe flow.
Their history cannot be reconstructed perfectly. Migration must preserve the
available evidence, identify inference as inference, and establish a correct
model going forward.

### Goals

1. Represent indefinite membership and mutually exclusive membership types.
2. Keep renewals as payments without a new board approval.
3. Give the board an explicit, safe non-payment workflow.
4. Preserve legal history without treating an audit log as domain data.
5. Support deterministic, additive, order-independent legacy imports.
6. Migrate the current production database in one rehearsed transaction.

### Non-goals

- Automatic reminders or automatic membership status changes
- Stripe Invoicing or automatic Stripe refunds
- Partial payments, installments, discounts, or moving credit between periods
- Individual deadline extensions in the first release
- Importing organization members from CSV
- Custom member fields
- Bulk correction tooling for confirmed board decisions
- Multi-tenancy

## Invariants

These rules are the correctness boundary for the implementation:

1. One person or organization has one stable `member` aggregate.
2. A member has at most one approved membership type at a time.
3. Paying a renewal never approves, renews, or ends legal membership.
4. No failed, expired, or abandoned checkout rejects an application.
5. Only a confirmed board/admin action changes an active membership to `ended`.
6. Overdue members retain all membership rights until that action, including QR
   verification and member-only access.
7. Imported inference may be rebuilt. Confirmed events are immutable and may
   only be corrected by a new event.
8. A fee is due only when a `required` obligation exists. Lack of a payment row
   alone does not create a debt.
9. A required obligation is settled only by a successful, non-refunded,
   non-invalidated payment for that obligation.
10. Live Stripe/manual activity and confirmed membership events always take
    precedence over imported inference.

## Data model

Names below use application-level camel case. Database migrations continue to
use the project's snake-case convention.

### `membershipType`

| Column                      | Type                    | Notes                                                 |
| --------------------------- | ----------------------- | ----------------------------------------------------- |
| id                          | TEXT PK                 | Stable identifier, for example `varsinainen-jasen`    |
| name                        | JSONB (LocalizedString) | Display name                                          |
| description                 | JSONB (LocalizedString) | Optional description                                  |
| purchasable                 | BOOLEAN                 | Users may select this type themselves                 |
| requiresPayment             | BOOLEAN                 | Members of this type normally receive annual fee dues |
| requiresStudentVerification | BOOLEAN                 | Requires the configured student identity verification |
| createdAt, updatedAt        | TIMESTAMPTZ             | Standard timestamps                                   |

`purchasable` and `requiresPayment` are independent. For example, an honorary
type may be neither purchasable nor payable. A type may also be free for a
particular period by publishing a zero-fee period.

### `membershipFeePeriod`

This replaces the misleading `membershipPeriod` name. It describes a fee and
application target, not the duration of legal membership.

| Column               | Type                         | Notes                                                 |
| -------------------- | ---------------------------- | ----------------------------------------------------- |
| id                   | TEXT PK                      |                                                       |
| membershipTypeId     | TEXT FK -> membershipType    |                                                       |
| startDate            | DATE                         | Coverage/display start                                |
| endDate              | DATE                         | Coverage/display end                                  |
| dueDate              | DATE                         | Payment deadline                                      |
| nonPaymentActionAt   | DATE                         | Earliest allowed bulk non-payment action              |
| amount               | INTEGER                      | Minor currency units; zero means free for this period |
| currency             | TEXT                         | ISO currency code                                     |
| stripePriceId        | TEXT                         | Required before Stripe checkout, otherwise nullable   |
| publishedAt          | TIMESTAMPTZ                  | Null while draft                                      |
| acceptsApplications  | BOOLEAN                      | This is the user-facing target for new applications   |
| createdAt, updatedAt | TIMESTAMPTZ                  | Standard timestamps                                   |
| UNIQUE               | (membershipTypeId,startDate) | One period per type and start date                    |
| PARTIAL UNIQUE       | membershipTypeId             | At most one application target per type               |

A period starts as a draft. Publishing it atomically creates obligations for
applicable active members. Publishing never creates Stripe sessions or sends
messages.

After publication, membership type, coverage dates, amount, and currency are
locked. Admins may extend `dueDate` or `nonPaymentActionAt`, never move them
earlier, and each change is audited. `acceptsApplications` may be moved between
published periods with explicit confirmation. This supports opening an upcoming
period early without deriving behavior from the calendar.

New periods are pre-filled by shifting the previous period's dates. There is no
global calendar-settings feature in this scope.

### `member`

| Column                     | Type                        | Notes                                                                  |
| -------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| id                         | TEXT PK                     | Stable across resignation, rejoining, and type changes                 |
| userId                     | TEXT FK -> user             | Null for an organization member                                        |
| organizationName           | TEXT                        | Null for an individual member                                          |
| status                     | ENUM                        | `awaiting_payment`, `awaiting_approval`, `active`, `ended`, `rejected` |
| membershipTypeId           | TEXT FK -> membershipType   | Most recently board-approved type; null if never approved              |
| pendingMembershipTypeId    | TEXT FK -> membershipType   | Type currently requested; otherwise null                               |
| currentMembershipStartedAt | TIMESTAMPTZ                 | Start of the current or most recently ended continuous membership      |
| applicationMotive          | TEXT                        | Latest application motive; never reused as an end reason               |
| createdAt, updatedAt       | TIMESTAMPTZ                 | Standard timestamps                                                    |
| CHECK                      | userId XOR organizationName | Exactly one identity form                                              |
| PARTIAL UNIQUE             | userId                      | One stable member per individual user                                  |

The approved type remains on an ended member for display. A paid applicant is
not assigned the requested type before approval. During an active member's type
change, `membershipTypeId` remains the old type and
`pendingMembershipTypeId` contains the requested type.

`currentMembershipStartedAt` means the latest continuous membership, not the
first membership ever. Rejoining updates it on approval. The first join and all
earlier intervals are retained in `membershipEvent`.

### `membershipEvent`

This is durable domain history. It is separate from the generic audit log,
whose purpose is security and operational traceability and whose write failure
must not invalidate a domain operation.

| Column                | Type                           | Notes                                                    |
| --------------------- | ------------------------------ | -------------------------------------------------------- |
| id                    | TEXT PK                        |                                                          |
| memberId              | TEXT FK -> member              |                                                          |
| eventType             | ENUM                           | Typed membership transition                              |
| effectiveAt           | TIMESTAMPTZ                    | When the change legally or inferentially took effect     |
| recordedAt            | TIMESTAMPTZ                    | When the system recorded it                              |
| source                | ENUM                           | `admin`, `system`, `imported`, `migration`               |
| certainty             | ENUM                           | `confirmed` or `inferred`                                |
| actorUserId           | TEXT FK -> user                | Nullable for migration/import                            |
| relatedEventId        | TEXT FK -> membershipEvent     | Corrected/superseded event, when applicable              |
| membershipFeePeriodId | TEXT FK -> membershipFeePeriod | Optional relevant period                                 |
| data                  | JSONB                          | Event-specific, schema-validated reason and type details |

Initial event types are:

- `application_submitted`, `application_approved`, `application_rejected`
- `type_change_requested`, `type_changed`, `type_change_rejected`
- `resigned_voluntarily`, `deemed_resigned_nonpayment`, `expelled`
- `legacy_membership_started_inferred`, `legacy_resignation_inferred`,
  `legacy_rejoin_inferred`
- `membership_decision_corrected`

Confirmed events are append-only. Correcting a mistake appends
`membership_decision_corrected`, references the wrong event, and updates the
current snapshot in the same transaction. Reapplying or paying is not required
to undo an admin entry mistake.

Imported inferred events are replaceable derived data. An import may delete and
rebuild those events from the complete set of imported payment evidence, but it
must never rewrite a confirmed event.

The member activity view combines membership events and payments. Corrected
events may be collapsed for members and remain expandable for admins.

### `membershipObligation`

An obligation exists only when a fee has actually been issued to a member. It
is not backfilled for historical imports.

| Column                | Type                             | Notes                                             |
| --------------------- | -------------------------------- | ------------------------------------------------- |
| id                    | TEXT PK                          |                                                   |
| memberId              | TEXT FK -> member                |                                                   |
| membershipFeePeriodId | TEXT FK -> membershipFeePeriod   |                                                   |
| kind                  | ENUM                             | `renewal`, `application`, or `type_change`        |
| disposition           | ENUM                             | `required`, `waived`, or `cancelled`              |
| dispositionReason     | TEXT                             | Required for waiver; optional for cancellation    |
| createdAt, updatedAt  | TIMESTAMPTZ                      | Standard timestamps                               |
| UNIQUE                | (memberId,membershipFeePeriodId) | At most one issued fee for this member and period |

Paid/unpaid is derived from payments and is not duplicated on the obligation.
The three useful views are therefore:

- required and settled;
- required and unsettled;
- waived or cancelled.

Publishing a non-zero fee period for a payable type creates one `renewal`
obligation for every currently active member of that approved type. The unique
constraint makes publication idempotent. Free types and zero-fee periods create
no obligations.

An admin who directly activates a member of a paid type either records a full
manual payment or explicitly waives the applicable obligation with a reason.
The system never fabricates a payment to explain the exception.

### `payment`

Each row is one real or inferred payment attempt. Retaining attempts is
necessary for Stripe webhook idempotency and delayed payment outcomes.

| Column                | Type                            | Notes                                                         |
| --------------------- | ------------------------------- | ------------------------------------------------------------- |
| id                    | TEXT PK                         |                                                               |
| memberId              | TEXT FK -> member               |                                                               |
| membershipFeePeriodId | TEXT FK -> membershipFeePeriod  | Always present                                                |
| obligationId          | TEXT FK -> membershipObligation | Nullable only for historical imported/migrated evidence       |
| source                | ENUM                            | `stripe`, `manual`, `imported`                                |
| status                | ENUM                            | `pending`, `succeeded`, `failed`, `expired`                   |
| amount                | INTEGER                         | Minor units; nullable when historical evidence lacks it       |
| currency              | TEXT                            | Nullable when historical evidence lacks it                    |
| paidAt                | TIMESTAMPTZ                     | Nullable when the exact historical completion time is unknown |
| stripeSessionId       | TEXT UNIQUE                     | Nullable outside Stripe                                       |
| stripePaymentIntentId | TEXT UNIQUE                     | Nullable outside Stripe                                       |
| refundRequiredAt      | TIMESTAMPTZ                     | Admin must process a refund manually                          |
| refundConfirmedAt     | TIMESTAMPTZ                     | Refund verified from Stripe or manually confirmed             |
| stripeRefundId        | TEXT UNIQUE                     | Nullable for a non-Stripe refund                              |
| manualRefundReference | TEXT                            | Required when a non-Stripe refund is confirmed                |
| invalidatedAt         | TIMESTAMPTZ                     | Explicit correction of bad imported evidence                  |
| invalidationReason    | TEXT                            | Required when invalidated                                     |
| createdAt, updatedAt  | TIMESTAMPTZ                     | Standard timestamps                                           |

A composite foreign key from
`payment(obligationId, memberId, membershipFeePeriodId)` to the same obligation
columns prevents payments from being attached across members or types.

Each retry creates a new payment row. Failed and expired attempts are retained,
not deleted. Unique Stripe identifiers make webhook replay idempotent. A partial
unique index permits at most one successful, non-refunded, non-invalidated
payment per obligation.

The first release accepts only full settlement. Stripe checkout uses the fee
period amount and currency, and manual payments must match them.

## Lifecycle and workflows

### New application

1. The user selects a purchasable type, not a year.
2. The system targets that type's single published
   `acceptsApplications` fee period. Without one, applications are unavailable.
3. The stable member is created or reused with the target in
   `pendingMembershipTypeId`.
4. For a paid period, the system creates an `application` obligation and a
   Stripe payment attempt. A free application skips checkout.
5. Successful payment, or submission of a free application, moves a
   never-approved applicant to `awaiting_approval` and appends
   `application_submitted`.
6. Board approval moves the pending type to `membershipTypeId`, sets
   `currentMembershipStartedAt`, changes status to `active`, and appends
   `application_approved`.

Failed or abandoned checkout leaves the applicant in `awaiting_payment`.
Returning creates a new attempt when the old Stripe session is no longer
usable. It does not create a rejection or a membership event.

Board rejection appends `application_rejected`. A paid application is marked
`refundRequiredAt`; an unpaid application obligation is cancelled. A
never-approved applicant becomes `rejected`. A previously ended member returns
to `ended`, preserving their old approved type and history.

### Renewal

Publishing a fee period issues obligations to the active members of its type.
Paying one changes only the obligation's derived settlement state. The member
remains active before, during, and after payment and requires no approval.

The admin overdue preset is based on:

- member status is `active`;
- obligation disposition is `required`;
- no successful, non-refunded, non-invalidated payment settles it;
- the obligation belongs to the relevant published fee period; and
- the fee period's due date has passed.

It does not compare `paidAt` to `dueDate`, so an applicant who joins and pays
after the general deadline is not mistaken for an existing non-payer.

### Type change during renewal

Self-service type changes are available only instead of paying for a new fee
period. They are not a general mid-period operation.

1. An active member selects another eligible, purchasable type and confirms
   that the change requires board approval.
2. The target type's application period gets a `type_change` obligation and is
   paid like a new membership. A free target skips payment.
3. After payment, `pendingMembershipTypeId` is set and
   `type_change_requested` is appended. The old approved type and active status
   remain unchanged.
4. While the request is pending, the old type's obligation for the same new
   period is excluded from reminders.
5. Approval changes the approved type, clears the pending type, appends
   `type_changed`, and cancels the replaced old-type obligation. It does not
   restart `currentMembershipStartedAt`.
6. Rejection retains the old type, clears the pending type, appends
   `type_change_rejected`, restores the old obligation to reminder views, and
   flags the target payment for manual refund.

Once the member has already settled the new period under their old type,
self-service type change is no longer offered. Exceptional mid-period changes
are handled manually by an admin.

### Ending and rejoining

`ended` is deliberately neutral. The event records whether membership ended by
voluntary resignation, a board decision on non-payment, or expulsion.

Voluntary resignation and expulsion are individual confirmed actions. The
non-payment action is a board-triggered bulk operation and is disabled before
`nonPaymentActionAt`; it cannot be bypassed with a warning.

The bulk transaction:

1. validates that every selected member is still active and still unpaid;
2. updates each snapshot to `ended`;
3. appends one confirmed `deemed_resigned_nonpayment` event per member; and
4. retains the unpaid obligation as historical evidence.

Notices are sent after the transaction. Delivery success or failure is recorded
against the action, failed notices can be retried, and delivery failure never
undoes the board decision.

Rejoining uses the same stable member and the full application flow. Approval
sets a new `currentMembershipStartedAt`; older intervals remain in events.

### Overdue rights and QR verification

There is no `payment_overdue` membership status. Before a confirmed ending
action, an overdue member is legally active and remains valid in membership and
QR checks.

Admin views and QR scans may show a separate fee state:

- Paid
- Overdue
- Not due
- No fee
- No obligation

That information does not change access authorization.

### Manual refunds

The application never initiates a Stripe refund in this scope.

When a paid application or type change is rejected, it sets
`refundRequiredAt`. An admin refunds it in the Stripe Dashboard and then uses
“Verify refund”; the server fetches Stripe's state and stores
`refundConfirmedAt` and `stripeRefundId`. A non-Stripe refund may be confirmed
manually with a required reference.

A confirmed refund stops the payment from settling its obligation. It never
automatically changes legal membership.

### Reminders

The first renewal cycle uses an admin-triggered workflow:

1. Open the preset due/overdue list.
2. Review recipients.
3. Send a bulk reminder.
4. Record the delivery result and last message.

Schedulers, recurring reminders, and Stripe-generated invoices remain out of
scope.

### Imported uncertainty and corrections

Member-facing UI shows an “imported information may be inaccurate” notice,
including the association's contact details, only while the current snapshot
depends on inferred legacy events. Inferred history retains a visible marker.

A later confirmed event establishes authoritative current state and removes the
current warning. Historical inferred events remain labelled. Member UI may
collapse corrected events; admin history can expand them.

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
