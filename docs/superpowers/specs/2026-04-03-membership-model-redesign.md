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

| Column               | Type                         | Notes                                               |
| -------------------- | ---------------------------- | --------------------------------------------------- |
| id                   | TEXT PK                      |                                                     |
| membershipTypeId     | TEXT FK -> membershipType    |                                                     |
| startDate            | DATE                         | Coverage/display start                              |
| endDate              | DATE                         | Coverage/display end                                |
| dueDate              | DATE                         | Payment deadline                                    |
| nonPaymentActionAt   | DATE                         | Earliest allowed bulk non-payment action            |
| amount               | INTEGER                      | Minor units; nullable for draft/unknown legacy data |
| currency             | TEXT                         | ISO code; nullable for draft/unknown legacy data    |
| stripePriceId        | TEXT                         | Required before Stripe checkout, otherwise nullable |
| publishedAt          | TIMESTAMPTZ                  | Null while draft                                    |
| acceptsApplications  | BOOLEAN                      | This is the user-facing target for new applications |
| createdAt, updatedAt | TIMESTAMPTZ                  | Standard timestamps                                 |
| UNIQUE               | (membershipTypeId,startDate) | One period per type and start date                  |
| PARTIAL UNIQUE       | membershipTypeId             | At most one application target per type             |

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
  `legacy_rejoin_inferred`, `legacy_type_changed_inferred`
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

## Legacy CSV import

### Import lifecycle

Each installation has a nullable `membershipDataLiveAt` timestamp.

- **Import mode:** while it is null, admins may repeatedly import historical
  data and rebuild inferred history.
- **Finalize and go live:** the admin reviews a final preview and explicitly
  establishes the live boundary.
- **Live mode:** later imports may add history only for fee periods beginning
  before the boundary. Rows for periods beginning on or after it are rejected.

Stripe checkout is unavailable in import mode. Publishing or opening the first
live fee period prompts the admin to finalize imports and sets
`membershipDataLiveAt` in the same transaction. The first Stripe action never
silently changes the mode.

Historical rows imported after go-live cannot create inference at or after the
boundary and cannot override confirmed events. This makes finalization a real
transfer from a legacy system to this system without banning legitimate late
historical cleanup.

### Input and period calendar

The canonical CSV keeps the existing exact date field:

```csv
firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
Testi,Henkilö,Helsinki,testi@aalto.fi,varsinainen-jasen,2023-08-01
Testi,Henkilö,Helsinki,testi@aalto.fi,varsinainen-jasen,2024-08-01
Testi,Henkilö,Helsinki,testi@aalto.fi,ulkojasen,2025-08-01
```

`membershipStartDate` identifies the fee period. It is not treated as a payment
timestamp or a board approval date. A legacy year-only variant may be accepted
only when the import supplies the month/day calendar used to expand it; exact
dates are never reduced to years.

An onboarding import supplies fallback period rules for dates missing from the
database. The preview shows them, and the import audit entry stores them with
the inference `asOf` date. Tietokilta's production fallback is:

- start: August 1;
- end: July 31 of the following year;
- due: September 30; and
- earliest non-payment action: December 1.

The importer creates missing historical `membershipFeePeriod` rows for the
expected sequence between the earliest imported period and `asOf`, including
empty periods needed to recognize a gap. These historical periods remain
unpublished and never create obligations. If the import cannot establish an
expected period sequence, it preserves payments but reports that lifecycle
inference is unavailable.

Historical fee amount and currency may be null when the source data does not
contain them. Current drafts must have amount and currency before publication.

### Parse and identity rules

The import first parses and validates the complete file. Any row-level error
prevents commit.

1. Normalize and match individual users by email.
2. Reject organization-member CSV rows; existing organization members are
   preserved by production migration and managed manually.
3. Create or reuse one stable `member` per user.
4. For an untouched imported placeholder account, profile fields come from the
   row with the greatest `membershipStartDate`.
5. An older import never overwrites a newer imported profile.
6. A verified, activated, or user-edited profile is never overwritten.
7. Conflicting profile rows for the same email and exact date are an error.
8. Different emails remain different users. Suspected duplicates are reported;
   user merging is outside this RFC.

### Additive payment evidence

Each unique `(member, membership type, fee period)` row adds one successful
`source = imported` payment without an obligation. `paidAt`, amount, and
currency remain null unless the source actually supplies them.

The importer is additive:

- importing the same row again is a no-op;
- file order and import order do not affect the final result;
- absence from a later CSV never removes earlier evidence;
- a valid existing Stripe or manual payment for the same member and period
  means the imported row is skipped and reported as already covered; and
- invalid imported evidence is retained with `invalidatedAt` and a reason.
  Re-importing it remains a no-op until an admin explicitly restores it.

Duplicate legacy rows for the same person, type, and period are collapsed into
one imported payment and listed in the preview. Without a source transaction
identifier they do not prove that two payments occurred.

No historical obligations are fabricated. Fee periods, imported payment
evidence, and inferred membership events are sufficient to represent the
available history.

### Inference algorithm

After adding evidence, the importer recomputes only replaceable inferred events
for affected members. It never deletes a member, confirmed event, payment,
obligation, or live field in order to rebuild history.

For each affected member:

1. Load all non-invalidated imported payments, relevant successful live
   payments, historical fee periods, and confirmed membership events.
2. Remove the member's previous imported/migration events with
   `certainty = inferred` before the live boundary, or all such events while
   still in import mode.
3. Sort evidence by exact period dates, independent of CSV and import order.
4. The first legacy payment infers a membership start at the period start unless
   a confirmed event already establishes a different state.
5. Consecutive paid periods add payments only. They are not membership renewal
   events.
6. For a missing expected period, infer `legacy_resignation_inferred` at that
   period's `nonPaymentActionAt` only when `asOf` has reached the date.
7. A later payment after an inferred end adds `legacy_rejoin_inferred` at the
   later period's start.
8. A sequential change to a different type adds an inferred type-change event
   while keeping the continuous membership. Payment evidence for mutually
   exclusive types in the same or overlapping period is ambiguous: preserve
   both payments, report the conflict, and infer no transition from them.
9. Replay the combined chronological timeline into the current snapshot,
   ignoring inferred transitions wherever they conflict with confirmed state.

The December 1 Tietokilta fallback is explicitly an inference based on recent
bulk-resignation practice. It does not claim that the board made a recorded
decision on that date. A member whose latest missing period has a future action
date remains inferred active. Once the live boundary is established, merely
passing a deadline never creates a new event; only a real board action can end
membership for a live obligation.

If a later additive import fills a historical gap, the inferred end and rejoin
events disappear on rebuild. Member UI may collapse the correction, while admin
history and the import audit retain what happened.

### Conflicts and preview

Normal admin activity never blocks an import. A confirmed voluntary
resignation, expulsion, correction, or type change simply takes precedence;
conflicting imported inference is skipped and shown in the preview.

Manual review is required only when the data cannot satisfy a core invariant,
including:

- overlapping mutually exclusive types with no authoritative current type;
- two conflicting profile values for the same identity and exact date; or
- a row whose type or period cannot be mapped.

The preview reports created users, periods, payments, and inferred events;
collapsed duplicates; protected live data; ambiguities; and the resulting
current-state counts. Dry run executes the same code in a transaction and rolls
it back.

### Convergence examples

All import sequences below converge after the inferred events are rebuilt:

| Import sequence                            | Final evidence and inferred history                                       |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| 2023, 2024, 2025 in any order              | One stable member, three payments, one continuous membership              |
| 2020, 2021, 2024, 2025                     | Four payments, inferred end at the 2022 action date, rejoin in 2024       |
| Previous row set, then 2022 and 2023       | Six payments; the inferred end and rejoin disappear                       |
| 2025 Stripe payment, then 2020–2025 import | One stable member; Stripe evidence is retained and duplicate 2025 skipped |
| Confirmed resignation, then older import   | Payment history is added; confirmed current state remains unchanged       |

## Production migration

### Deployment shape

Review is split into small schema, migration, workflow, and test commits. The
production cutover itself is one transactional Drizzle schema-and-data
migration, run with writes briefly stopped. There is no dual-write period and
no retained compatibility tables. A database snapshot is the rollback source.

The same migration also runs on fresh installations. It sets
`membershipDataLiveAt` only when legacy member rows actually exist. An empty new
installation remains in import mode until its admin finalizes onboarding.

### Evidence classification

Migration must not turn every old row into a paid payment. In particular,
`stripeSessionId` proves that checkout was created, not that it succeeded.

The migration uses this evidence in descending authority:

1. Existing audit actions create confirmed board/admin events.
2. `awaiting_approval` proves that the application payment completed.
3. For a payable type, `active` or an old status representing previously active
   membership is evidence of a completed purchase. A Stripe session makes its
   payment source `stripe`; otherwise legacy period-shaped data becomes
   `imported`. Free types establish membership evidence without a payment.
4. An old imported active/ended period row may create a successful imported
   payment with unknown `paidAt`, amount, and currency. Its lifecycle events
   remain inferred unless an audit action confirms them.
5. `awaiting_payment` proves only an attempted checkout. It becomes a pending or
   expired payment attempt and never a successful payment.
6. `rejected` is ambiguous. Audit history may prove a paid board rejection; if
   it does not, preserve the rejection without inventing a successful payment
   and list it in the rehearsal warnings.

The migration never copies `member.createdAt` into `payment.paidAt`. Unknown is
represented as null.

### Transaction steps

Within one migration transaction:

1. Create the event, obligation, and payment structures and add the new member,
   type, fee-period, and onboarding fields.
2. Convert old period timestamps to `DATE` in the association timezone. For
   Tietokilta this is `AT TIME ZONE 'Europe/Helsinki'` before the date cast, so
   local midnight does not become the previous UTC date.
3. Backfill Tietokilta historical due and inference dates using September 30 and
   December 1. Mark them as migration assumptions.
4. Collapse old per-period rows into one stable member per user or organization.
   Preserve a deterministic existing identifier and rewire every referencing
   row before removing duplicates.
5. Create payments and confirmed/inferred membership events according to the
   evidence rules above. Do not create historical obligations.
6. Replay events to materialize `status`, approved/pending type, and
   `currentMembershipStartedAt`.
7. Preserve all existing organization members without attempting CSV-style
   inference.
8. Validate database invariants and expected classifications.
9. Set `membershipDataLiveAt` because this installation contained live legacy
   data, then remove obsolete period-shaped columns and rows.

Any invariant failure aborts the whole transaction. Delayed Stripe webhooks
remain safe because old session identifiers are retained on payment attempts
rather than deleted.

### Local rehearsal against production

Before deployment, export a production snapshot and run the exact Drizzle
migration against local copies. The rehearsal helper is development-only; it is
not a deployed table or application feature.

Its report includes:

- before/after counts by old and new status;
- classification counts for Stripe, imported, pending, and ambiguous payments;
- stable-member collapses and reference rewrites;
- inferred starts, ends, rejoins, and type changes;
- ambiguous rejected rows and overlapping types;
- timezone/date conversions;
- current snapshots that still depend on inference;
- orphan, uniqueness, and cross-type invariant checks; and
- a comparison of two fresh-snapshot rehearsal runs to prove determinism.

Detailed rows and personal data stay local. Sanitized totals and explained
warnings may be added to the pull request. We do not have the original kide.app
CSV exports, so importer coverage uses synthetic fixtures; the production
snapshot validates the migration path.

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
