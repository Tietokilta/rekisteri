# Membership Model Redesign: Implementation Reference

This document contains the proposed schema, algorithms, scenario matrix, and
rollout details for the
[membership model RFC](./2026-04-03-membership-model-redesign.md). The RFC is
the review document and source of product decisions.

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
11. A paid application or type change cannot be approved until its target
    obligation is settled. A direct admin activation is the separate,
    explicitly waived exception.
12. Every purchasable membership type has exactly one valid application target;
    there is no intentional closed-applications state.
13. A new applicant owes the selected application fee period, not an earlier
    period. Board approval activates membership immediately regardless of that
    fee period's display dates.
14. Ending membership cancels every unsettled obligation. Rejoining never
    revives an old debt.
15. Published fee-period dates and deadlines are immutable.

Membership decisions lock the stable member row and append the event plus
snapshot update in one transaction. Payment state changes and non-payment
actions lock the relevant obligation before deciding whether it is settled.
Using the same member-then-obligation lock order prevents a payment/bulk-action
race from ending a member who just paid.

## Data model

Names below use application-level camel case. Database migrations continue to
use the project's snake-case convention.

### `membershipType`

| Column                         | Type                           | Notes                                                        |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------ |
| id                             | TEXT PK                        | Stable identifier, for example `varsinainen-jasen`           |
| name                           | JSONB (LocalizedString)        | Display name                                                 |
| description                    | JSONB (LocalizedString)        | Optional description                                         |
| purchasable                    | BOOLEAN                        | Users may select this type themselves                        |
| requiresPayment                | BOOLEAN                        | Members of this type normally receive annual fee dues        |
| requiresStudentVerification    | BOOLEAN                        | Requires the configured student identity verification        |
| legacyInferenceThroughPeriodId | TEXT FK -> membershipFeePeriod | Last fully billed legacy period; nullable until finalization |
| createdAt, updatedAt           | TIMESTAMPTZ                    | Standard timestamps                                          |

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
| PARTIAL UNIQUE       | membershipTypeId             | `WHERE acceptsApplications`; at most one target     |

A period starts as a draft. Publishing it atomically creates obligations for
applicable active members. Publishing never creates Stripe sessions or sends
messages. `endDate` must not precede `startDate`, and
`nonPaymentActionAt` must follow `dueDate`; each association chooses the actual
grace period required by its rules before publication.

After publication, membership type, every date, amount, and currency are locked.
Post-publication deadline changes are not supported in this release.

`acceptsApplications` moves atomically between published periods with explicit
confirmation. It cannot simply be cleared. A type cannot become `purchasable`
until a published, correctly priced target exists. A target may be current or
upcoming, but it is invalid after its `endDate`; the application flow never
falls back to an expired period. These application-level rules strengthen the
partial index from "at most one" to the required "exactly one" across the type
and period tables.

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
| currentMembershipEndedAt   | TIMESTAMPTZ                 | End of the most recently ended interval; null while active             |
| applicationMotive          | TEXT                        | Latest application motive; never reused as an end reason               |
| createdAt, updatedAt       | TIMESTAMPTZ                 | Standard timestamps                                                    |
| CHECK                      | userId XOR organizationName | Exactly one identity form                                              |
| UNIQUE                     | userId                      | One stable member per user; PostgreSQL permits multiple nulls          |

The approved type remains on an ended member for display. A paid applicant is
not assigned the requested type before approval. During an active member's type
change, `membershipTypeId` remains the old type and
`pendingMembershipTypeId` contains the requested type.

`currentMembershipStartedAt` and `currentMembershipEndedAt` are the list-query
snapshot of the latest interval, not the complete history. Rejoining replaces
the start and clears the end on approval. The first join and every earlier
interval remain in `membershipEvent`.

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

| Column                | Type                                | Notes                                             |
| --------------------- | ----------------------------------- | ------------------------------------------------- |
| id                    | TEXT PK                             |                                                   |
| memberId              | TEXT FK -> member                   |                                                   |
| membershipFeePeriodId | TEXT FK -> membershipFeePeriod      |                                                   |
| kind                  | ENUM                                | `renewal`, `application`, or `type_change`        |
| disposition           | ENUM                                | `required`, `waived`, or `cancelled`              |
| dispositionReason     | TEXT                                | Required for waiver; optional for cancellation    |
| createdAt, updatedAt  | TIMESTAMPTZ                         | Standard timestamps                               |
| UNIQUE                | (memberId,membershipFeePeriodId)    | At most one issued fee for this member and period |
| UNIQUE                | (id,memberId,membershipFeePeriodId) | Composite payment FK target                       |

Paid/unpaid is derived from payments and is not duplicated on the obligation.
The three useful views are therefore:

- required and settled;
- required and unsettled;
- waived or cancelled.

Publishing a non-zero fee period for a payable type creates one `renewal`
obligation for every currently active member of that approved type. The unique
constraint makes publication idempotent. Free types and zero-fee periods create
no obligations. A non-zero period cannot be published for a type whose
`requiresPayment` is false.

An obligation may change from `required` to `cancelled`, or be restored to
`required` after a rejected pending type change. Every disposition change is
audited. Cancelling retains the obligation and payment history; it means the fee
is no longer collectible.

An admin who directly activates a member of a paid type either records a full
manual payment or explicitly waives the applicable obligation with a reason.
The system never fabricates a payment to explain the exception.

### `payment`

Each row is one real or inferred payment attempt. Retaining attempts is
necessary for Stripe webhook idempotency and delayed payment outcomes.

| Column                | Type                            | Notes                                                                                               |
| --------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| id                    | TEXT PK                         |                                                                                                     |
| memberId              | TEXT FK -> member               |                                                                                                     |
| membershipFeePeriodId | TEXT FK -> membershipFeePeriod  | Always present                                                                                      |
| obligationId          | TEXT FK -> membershipObligation | Nullable only for historical imported/migrated evidence                                             |
| source                | ENUM                            | `stripe`, `manual`, `imported`                                                                      |
| status                | ENUM                            | `pending`, `succeeded`, `failed`, `expired`                                                         |
| amount                | INTEGER                         | Minor units; nullable when historical evidence lacks it                                             |
| currency              | TEXT                            | Nullable when historical evidence lacks it                                                          |
| paidAt                | TIMESTAMPTZ                     | Nullable when the exact historical completion time is unknown                                       |
| stripeSessionId       | TEXT UNIQUE                     | Nullable outside Stripe                                                                             |
| stripePaymentIntentId | TEXT UNIQUE                     | Nullable outside Stripe                                                                             |
| refundRequiredAt      | TIMESTAMPTZ                     | Admin must process a refund manually                                                                |
| refundReason          | ENUM                            | `application_rejected`, `type_change_rejected`, `duplicate_payment`, `obsolete_obligation`, `other` |
| refundConfirmedAt     | TIMESTAMPTZ                     | Refund verified from Stripe or manually confirmed                                                   |
| stripeRefundId        | TEXT UNIQUE                     | Nullable for a non-Stripe refund                                                                    |
| manualRefundReference | TEXT                            | Required when a non-Stripe refund is confirmed                                                      |
| invalidatedAt         | TIMESTAMPTZ                     | Explicit correction of bad imported evidence                                                        |
| invalidationReason    | TEXT                            | Required when invalidated                                                                           |
| createdAt, updatedAt  | TIMESTAMPTZ                     | Standard timestamps                                                                                 |

A composite foreign key from
`payment(obligationId, memberId, membershipFeePeriodId)` to the same obligation
columns prevents payments from being attached across members or types. It uses
PostgreSQL `MATCH SIMPLE`, so historical rows with a null `obligationId` are
exempt while their member and fee-period provenance remains recorded.

Each retry creates a new payment row. Failed and expired attempts are retained,
not deleted. Unique Stripe identifiers make webhook replay idempotent. A partial
unique index on `obligationId WHERE status = 'pending'` permits at most one
pending Stripe attempt per obligation; a new attempt requires the previous
session to be confirmed unusable and marked failed or expired.

The ledger must allow more than one successful payment because two real charges
can occur despite checkout safeguards. The obligation is settled when at least
one successful, non-refunded, non-invalidated payment exists. Any additional
success is recorded, flagged with `refundReason = duplicate_payment`, and shown
to admins for manual refund.

A success arriving for an already cancelled or waived obligation is likewise
recorded and queued with `refundReason = obsolete_obligation`.

The first release accepts only full settlement. Stripe checkout uses the fee
period amount and currency, and manual payments must match them.

## Lifecycle and workflows

### New application

1. The user selects a purchasable type, not a year.
2. The system targets that type's single published
   `acceptsApplications` fee period. It does not derive the target from today's
   date. The checkout shows the exact period, dates, and price.
3. The stable member is created or reused with the target in
   `pendingMembershipTypeId`.
4. For a paid period, the system creates an `application` obligation and a
   Stripe payment attempt. A free application skips checkout.
5. Successful payment, or submission of a free application, moves a
   never-approved applicant to `awaiting_approval` and appends
   `application_submitted`.
6. Board approval moves the pending type to `membershipTypeId`, sets
   `currentMembershipStartedAt`, changes status to `active`, and appends
   `application_approved`. Approval takes effect immediately even if the paid
   fee period starts later.

The application obligation is the new member's first issued fee. Approval does
not create an obligation for any earlier period. Fee-period dates describe the
fee and never gate legal membership, QR validity, or other member rights.
Approval does create any missing renewal obligation for an already-published
later period of the approved type. The member-period unique key prevents a
duplicate when the application itself already covers that upcoming period.

Failed or abandoned checkout leaves the applicant in `awaiting_payment`.
Returning creates a new attempt when the old Stripe session is no longer
usable. It does not create a rejection or a membership event.

Before payment succeeds, retry re-evaluates the type's current application
period. If the admin moved applications to an upcoming period, the old
obligation and checkout are cancelled/expired and the user sees the new dates
and price before starting another attempt. A successful payment is never
silently moved between periods.

Board rejection appends `application_rejected`. A paid application is marked
`refundRequiredAt`, and its application obligation is cancelled whether paid or
unpaid. A never-approved applicant becomes `rejected`. A previously ended
member returns to `ended`, preserving their old approved type and history. A
later reapplication to the same period reopens the existing obligation instead
of inserting a duplicate.

### Application availability

Applications cannot be intentionally closed. Every `purchasable` type must have
one valid target: a published, unexpired period with complete amount/currency
configuration and, for a non-zero paid fee, a usable Stripe price. Enabling a
type or moving its target is transactional, and removing the last target is
rejected. There is no fallback to the calendar-current or an expired period.

The admin UI shows a persistent warning starting 30 days before a target ends.
A daily operational check sends one deduplicated board email for that warning
and one if the type actually becomes unavailable. The incident clears when a
valid successor is selected. Email delivery uses a persisted incident key so
restarts or concurrent server instances cannot duplicate it. These board
availability alerts do not automate member reminders or membership decisions.

### Renewal

Publishing a fee period issues obligations to the active members of its type.
Paying one changes only the obligation's derived settlement state. The member
remains active before, during, and after payment and requires no approval.

For a type with `requiresStudentVerification`, checkout requires verification
that is valid at payment time. Missing or expired verification hard-blocks
same-type payment and presents an explicit choice: re-verify, or request and pay
for an eligible type change. Verification expiry never changes legal membership
or silently changes the obligation. If the member takes neither path, the
required obligation follows the ordinary reminder and board-controlled overdue
workflow, with the missing-verification reason visible to admins. Expiry after a
successful payment has no retroactive effect.

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
4. When the target payment succeeds, the old type's obligation for the same new
   period changes to `cancelled` with reason `pending_type_change`. This removes
   it from reminders, overdue views, and bulk ending rather than relying on each
   consumer to add an exception.
5. Approval changes the approved type, clears the pending type, appends
   `type_changed`, and changes the old obligation's reason to
   `replaced_by_type_change`. It does not restart
   `currentMembershipStartedAt`.
6. Rejection retains the old type, clears the pending type, appends
   `type_change_rejected`, restores the old obligation to `required`, and
   cancels the target obligation. A successful target payment is flagged for
   manual refund.

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
2. updates each snapshot to `ended` and sets `currentMembershipEndedAt`;
3. appends one confirmed `deemed_resigned_nonpayment` event per member; and
4. cancels every unsettled obligation with reason `membership_ended`.

Voluntary resignation and expulsion perform the same obligation cancellation.
The rows remain as historical evidence, but cancelled fees are not collectible
and never reappear after rejoining.

Notices are sent after the transaction. Delivery success or failure is recorded
against the action, failed notices can be retried, and delivery failure never
undoes the board decision.

Rejoining uses the same stable member and the full application flow. It creates
an application obligation or, for the same fee period, reopens the existing
cancelled row so the member pays immediately. Approval sets a new
`currentMembershipStartedAt`, clears `currentMembershipEndedAt`, and leaves
older intervals in events.

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
"Verify refund" on that exact payment; the server fetches its PaymentIntent and
stores
`refundConfirmedAt` and `stripeRefundId`. A non-Stripe refund may be confirmed
manually with a required reference. Only a full refund clears the requirement;
partial refunds are outside this release.

A duplicate successful payment enters the same queue with
`refundReason = duplicate_payment`. Recording the extra charge never displaces
the earlier payment that already settled the obligation.

If an admin refunds a different charge in Stripe, verification leaves the
flagged payment pending, checks sibling Stripe payments for the obligation,
synchronizes the actual refund, and reports the mismatch. Any other successful,
non-refunded payment continues to settle the obligation.

A confirmed refund stops the payment from settling its obligation. It never
automatically changes legal membership.

### Reminders

The first renewal cycle uses an admin-triggered workflow:

1. Open the preset due/overdue list.
2. Review recipients.
3. Send a bulk reminder.
4. Record the delivery result and last message.

Scheduled or recurring member reminders and Stripe-generated invoices remain
out of scope. The separate application-availability check only alerts admins
about configuration outages.

### Imported uncertainty and corrections

Member-facing UI shows an "imported information may be inaccurate" notice,
including the association's contact details, only while the current snapshot
depends on inferred legacy events. Inferred history retains a visible marker.

A later confirmed event establishes authoritative current state and removes the
current warning. Historical inferred events remain labelled. Member UI may
collapse corrected events; admin history can expand them.

## Legacy CSV import

### Import lifecycle

Each installation has a nullable `membershipDataLiveAt` timestamp.

- **Import mode:** while it is null, admins may repeatedly import historical
  payment evidence and preview inferred history. Imports do not commit inferred
  membership transitions yet.
- **Finalize and go live:** after all available imports, the admin selects the
  last fully billed period for each type, reviews the resulting inference, and
  explicitly establishes the live boundary.
- **Live mode:** later imports may add history only for fee periods beginning
  before the boundary. Rows for periods beginning on or after it are rejected.

Finalization atomically stores each type's
`legacyInferenceThroughPeriodId`, commits the previewed inferred events, sets
`membershipDataLiveAt`, and replays the current snapshots. The finalization UI
cannot guess those cutoffs before all imports have run. Stripe checkout is
unavailable in import mode. Publishing or opening the first live fee period
prompts this finalization; the first Stripe action never silently changes mode.

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

For preview and finalized inference, the importer creates missing historical
`membershipFeePeriod` rows only in the expected sequence between the earliest
imported period and the selected last fully billed period. It never extends the
sequence to the current date merely because time passed. The historical rows
remain unpublished and never create obligations. If the import cannot establish
an expected sequence, it preserves payments but reports that lifecycle
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

After finalization, an additive historical import recomputes only replaceable
inferred events for affected members and only through that type's stored cutoff.
Before finalization, the same algorithm powers a rollback-only preview. It never
deletes a member, confirmed event, payment, obligation, or live field in order
to rebuild history.

For each affected member:

1. Load all non-invalidated imported payments, relevant successful live
   payments, historical fee periods, and confirmed membership events.
2. Remove the member's previous imported/migration events with
   `certainty = inferred` before the live boundary and within the relevant
   type's stored cutoff. In import mode, do this only inside the preview
   transaction.
3. Sort evidence by exact period dates, independent of CSV and import order.
4. The first legacy payment infers a membership start at the period start unless
   a confirmed event already establishes a different state.
5. Consecutive paid periods add payments only. They are not membership renewal
   events.
6. For a missing expected period no later than the selected last fully billed
   period, infer `legacy_resignation_inferred` at that period's
   `nonPaymentActionAt` only when `asOf` has reached the date.
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
decision on that date. No absence after the selected fully billed cutoff proves
anything, and a gap whose action date is still in the future creates no end.
Once the live boundary is established, merely passing a deadline never creates
a new event; only a real board action can end membership for a live obligation.

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
| 2025 Stripe payment, then 2020-2025 import | One stable member; Stripe evidence is retained and duplicate 2025 skipped |
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

1. A successfully mapped audit action may create a confirmed board/admin event;
   audit absence proves nothing because current writes are best-effort.
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

### Legacy audit mapping

`audit_log.targetId` is plain text, and bulk actions store comma-separated old
member IDs as well as `metadata.memberIds`. The migration therefore builds an
explicit old-period-member-to-stable-member map, rewrites both representations,
and only then classifies the actions:

| Existing action                                     | Migration meaning                                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `member.approve`, `member.bulk_approve`             | `application_approved` when inactive; `type_changed` for a clear active-member type change; same-type renewal adds no transition |
| `member.auto_approve`                               | Renewal/payment evidence only; never board approval                                                                              |
| `member.reject`, `member.bulk_reject`               | `application_rejected` for a pending join, or `type_change_rejected` for a pending change; ambiguous rows are rehearsal warnings |
| `member.deem_resigned`, `member.bulk_deem_resigned` | Confirmed `deemed_resigned_nonpayment`                                                                                           |
| `member.resign`, `member.bulk_resign`               | Confirmed `resigned_voluntarily`                                                                                                 |
| `member.create`                                     | Classified from its initial status and payment/waiver evidence                                                                   |
| `member.bulk_import`                                | Import provenance only; never a confirmed membership decision                                                                    |

`member.reactivate` is a legacy escape hatch, not a new domain event. The
rehearsal counts any individual or bulk reactivation rows and requires those
rare rows to be classified manually as either a correction or a genuine
rejoining approval. If there are none, no mapping exists. Stale action names in
the TypeScript union do not by themselves create migration evidence.

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
   Preserve a deterministic existing identifier and build the complete old-to-
   stable ID map.
5. Rewire real foreign keys, then explicitly split and remap audit
   `targetId`/`metadata.memberIds` values before removing duplicate rows.
6. Create payments and confirmed/inferred membership events according to the
   evidence rules above. Do not create historical obligations.
7. Replay events to materialize `status`, approved/pending type,
   `currentMembershipStartedAt`, and `currentMembershipEndedAt`.
8. Preserve all existing organization members without attempting CSV-style
   inference.
9. Validate database invariants and expected classifications.
10. Store the rehearsed last-fully-billed cutoff for each legacy type and set
    `membershipDataLiveAt` because this installation contained live legacy
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
- remapped audit targets, action classifications, and any legacy reactivations;
- inferred starts, ends, rejoins, and type changes;
- the selected last fully billed period for each type;
- ambiguous rejected rows and overlapping types;
- timezone/date conversions;
- current snapshots that still depend on inference;
- orphan, uniqueness, and cross-type invariant checks; and
- a comparison of two fresh-snapshot rehearsal runs to prove determinism.

Detailed rows and personal data stay local. Sanitized totals and explained
warnings may be added to the pull request. We do not have the original kide.app
CSV exports, so importer coverage uses synthetic fixtures; the production
snapshot validates the migration path.

## Required scenario matrix

The test suite should express these as data-driven domain tests where possible.
End-to-end tests are reserved for the user, admin, Stripe webhook, and migration
boundaries. Dates must use a fixed clock and the Europe/Helsinki timezone.

### Member identity and history

| Scenario                                     | Expected result                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| First application is approved                | One stable member becomes active; approved type and start time are set       |
| Active member changes type                   | Same member ID; continuous start remains; a confirmed type event is appended |
| Ended member rejoins                         | Same member ID; applicable application fee is paid; a new interval starts    |
| Reapplication by an ended member is rejected | Snapshot returns to ended; rejection remains in events                       |
| Never-approved application is rejected       | Status becomes rejected; approved type remains null                          |
| Voluntary resignation                        | Status becomes ended with a confirmed voluntary event                        |
| Expulsion                                    | Status becomes ended with a confirmed expulsion event                        |
| Admin corrects a wrong ending action         | Correction event references the old event; snapshot is restored              |
| Member has imported and confirmed history    | Confirmed state wins; inferred events stay visibly labelled                  |
| Same user is inserted twice concurrently     | The stable-member uniqueness constraint prevents a duplicate                 |
| Two type approvals race on the same member   | Member-row locking serializes them; the later transaction revalidates state  |

### Applications and payment attempts

| Scenario                                           | Expected result                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| New paid application starts checkout               | Applicant awaits payment; obligation and pending attempt exist                 |
| Stripe checkout succeeds                           | Payment succeeds; applicant awaits approval; submission event is appended      |
| The success webhook is replayed                    | No duplicate payment, obligation, event, or status transition                  |
| Checkout fails or expires                          | Attempt is retained as failed/expired; applicant still awaits payment          |
| User retries after an expired attempt              | A new attempt is created; the old attempt remains                              |
| Application target changes before retry            | Old obligation/session closes; new dates and price require confirmation        |
| A delayed valid webhook arrives for an old attempt | The attempt succeeds idempotently; no missing-row failure                      |
| Delayed attempt succeeds after another payment     | Both charges are recorded; the duplicate is flagged for manual refund          |
| Delayed payment succeeds for cancelled obligation  | Charge is recorded and flagged as obsolete for manual refund                   |
| A second checkout starts while one is pending      | Existing usable session is resumed, or the new attempt is rejected             |
| User returns while a session is still reusable     | Existing pending session may be resumed                                        |
| Free purchasable type is submitted                 | No payment or obligation; applicant proceeds to board approval                 |
| Board approves a paid application                  | Member becomes active; payment is unchanged                                    |
| Upcoming period is the application target          | Checkout identifies it; no fee is created for the earlier period               |
| Upcoming-period applicant is approved early        | Membership starts immediately; fee-period dates do not gate membership         |
| Spring applicant pays the current application fee  | Approval also issues any already-published later renewal; both fees remain due |
| Board tries to approve before required payment     | Approval is rejected                                                           |
| Board rejects a paid application                   | Member is rejected/returned to ended; obligation is cancelled; refund required |
| Admin verifies the Stripe refund                   | Refund identifiers are stored and payment no longer settles the obligation     |
| Admin refunded a different Stripe charge           | Flagged refund remains pending; the actual refund is synchronized and warned   |
| Admin confirms a non-Stripe refund                 | A manual reference is required                                                 |
| Applicant pays after the general due date          | Approval may proceed; they never appear as an existing overdue member          |
| Payment member/period mismatches its obligation    | Composite foreign key rejects the write                                        |

### Application availability

| Scenario                                  | Expected result                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| Purchasable type has no valid target      | Configuration change is rejected, or an existing outage is shown prominently   |
| Admin tries to clear the only target      | Operation is rejected; replacement must be selected atomically                 |
| Target ends within 30 days                | Persistent admin warning and one deduplicated board email                      |
| Target expires without replacement        | No expired fallback; one outage email; public flow shows configuration failure |
| Upcoming target is selected early         | Applications remain available and payments bind to that upcoming period        |
| Successor is selected after an incident   | Alert clears and applications recover immediately                              |
| Daily check or server instance runs twice | Persisted incident key prevents duplicate email                                |

### Fee periods and obligations

| Scenario                                               | Expected result                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| Draft period is saved                                  | No obligation is created                                             |
| Non-zero payable period is published                   | One renewal obligation per applicable active member                  |
| Publication is retried                                 | No duplicate obligations                                             |
| Free membership type period is published               | No obligations                                                       |
| Free type has a non-zero draft amount                  | Publication is rejected                                              |
| Payable type has a zero-fee period                     | No obligations                                                       |
| New applicant joins after publication                  | Application covers its target; published later periods are caught up |
| Admin directly activates a paid member without payment | Waived obligation is required; no fake payment                       |
| Active member pays the renewal                         | Obligation settles; membership status and start time do not change   |
| Payment from the previous period exists                | New period's obligation remains unsettled                            |
| Member has no issued obligation                        | They do not appear in due/overdue views                              |
| Required obligation is refunded                        | It becomes unsettled; legal membership remains unchanged             |
| Admin edits any published date or deadline             | Operation is rejected                                                |
| Admin edits published type, amount, or currency        | Operation is rejected                                                |
| Partial or incorrectly sized manual payment is entered | Operation is rejected                                                |

### Student verification

| Scenario                                      | Expected result                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Verification is valid at renewal checkout     | Same-type payment proceeds normally                                                  |
| Verification is missing or expired            | Same-type checkout is blocked; re-verification and type-change choices are shown     |
| Member re-verifies                            | The existing obligation can be paid; no duplicate is created                         |
| Member requests an eligible paid type change  | Target payment proceeds to board approval; old obligation is cancelled while pending |
| Verification expires after successful payment | Payment and legal membership remain unchanged                                        |
| Member takes no action before the due date    | Membership remains active; admins see overdue plus missing-verification context      |
| Board confirms loss of eligibility            | Board may approve the appropriate type change; expiry alone never performs it        |

### Overdue, reminders, and ending membership

| Scenario                                             | Expected result                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| Required obligation is unpaid before due date        | Fee state is not due; member is active                            |
| Required obligation is unpaid after due date         | Fee state is overdue; member is still active                      |
| Honorary/free member                                 | Does not appear in the overdue preset                             |
| Obligation is waived or cancelled                    | Does not appear in the overdue preset                             |
| Successful payment exists                            | Does not appear in the overdue preset                             |
| Admin sends a reminder                               | Only reviewed eligible members are contacted; result is recorded  |
| Scheduler time passes                                | No automatic reminder or status change occurs                     |
| Bulk ending is attempted before `nonPaymentActionAt` | Action is blocked                                                 |
| Member pays between bulk preview and commit          | Member is not ended; admin sees that the row changed              |
| Eligible bulk action is committed                    | Member becomes ended and gets a confirmed non-payment event       |
| Notice delivery fails after the decision             | Ending remains committed; failed notice is visible and retryable  |
| Membership is ended                                  | Every unsettled obligation is cancelled with the ending reason    |
| Ended member's old unpaid obligation is viewed       | Historical row remains cancelled and is not collectible           |
| Ended member rejoins                                 | Old fee stays cancelled; application fee must be paid immediately |
| Overdue active member presents QR                    | Access remains valid; admin scan may also display "Overdue"       |

### Type changes during a new period

| Scenario                                           | Expected result                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Member selects their existing type                 | Normal renewal; no board approval                                               |
| Member selects a different eligible type           | Target obligation/payment starts; old type remains approved and active          |
| Type-change checkout is abandoned                  | Old type and obligation remain unchanged; no pending board request              |
| Paid type change awaits approval                   | Old obligation is cancelled at source; old legal type remains active            |
| Bulk ending runs while type change awaits approval | Cancelled old obligation excludes the member from the non-payment candidate set |
| Board approves type change                         | Target type becomes approved; old obligation is cancelled; start is unchanged   |
| Board tries to approve unpaid type change          | Approval is rejected                                                            |
| Board rejects paid type change                     | Old obligation is restored; target is cancelled; refund required                |
| Member already paid the new period under old type  | Self-service type change is unavailable; admin handles the exception            |
| Member tries a mid-period self-service change      | Operation is unavailable                                                        |
| Target type is free and purchasable                | Request skips checkout but still requires board approval                        |

### Import identity and idempotency

| Scenario                                           | Expected result                                               |
| -------------------------------------------------- | ------------------------------------------------------------- |
| Same CSV is imported twice                         | Second import is a no-op                                      |
| Same rows appear in every file order               | Identical users, periods, payments, events, and snapshots     |
| Consecutive years arrive in every import order     | One continuous inferred membership                            |
| Later CSV omits an earlier row                     | Earlier payment evidence remains                              |
| Duplicate row appears in one or several files      | One imported payment; duplicate warning                       |
| Existing successful Stripe/manual payment overlaps | Imported duplicate is skipped; live payment remains           |
| Invalidated imported row is imported again         | It stays invalidated until explicitly restored                |
| Exact start dates are present                      | Exact dates match periods without year truncation             |
| Year-only legacy row has a supplied calendar       | Date is expanded deterministically and assumption is audited  |
| Year-only row has no calendar                      | Validation fails                                              |
| Older profile row arrives last                     | It does not replace profile fields from a newer imported date |
| Activated or user-edited account is imported       | Profile fields remain untouched                               |
| Same email/date has conflicting profile values     | Import fails with a precise conflict                          |
| Same person appears under different emails         | Separate users; suspected duplicate is reported               |
| Organization row appears in CSV                    | Row is rejected as unsupported                                |
| Dry run is requested                               | Preview equals commit result, but all writes are rolled back  |

### Import inference and mixed sources

| Scenario                                                  | Expected result                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Gap action date is still in the future                    | Member remains inferred active                                                 |
| Missing period's December 1 action date has passed        | Inferred end is created with imported/migration provenance                     |
| A later paid period follows the gap                       | Inferred rejoin is created on the later period start                           |
| Gap is filled in a later import                           | Inferred end/rejoin disappear; payments and stable member remain               |
| Sequential periods change membership type                 | Inferred type change; continuous start remains                                 |
| Mutually exclusive types overlap                          | Payments remain; no transition inferred; review warning                        |
| Confirmed admin resignation differs from inferred history | Import adds payment history but confirmed current state wins                   |
| Confirmed correction exists                               | Rebuild does not restore the corrected inference                               |
| Import mode receives another historical file              | Evidence is added; inference preview changes but no transition is committed    |
| Go-live is finalized                                      | Per-type fully billed cutoffs and boundary are stored; preview is committed    |
| Onboarding in December has data only through last year    | Admin selects that last billed period; no missing-current-year end is inferred |
| Missing period is after the selected cutoff               | No resignation is inferred                                                     |
| Post-live import adds a pre-boundary period               | Historical evidence/inference may be added; confirmed state remains protected  |
| Post-live import contains a post-boundary period          | Row is rejected                                                                |
| Fresh installation runs all Drizzle migrations            | It remains in import mode because no legacy members exist                      |

### Production migration

| Legacy evidence                                  | Expected migrated result                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `awaiting_payment` with a Stripe session         | Non-successful retained attempt; no fabricated payment                     |
| `awaiting_approval`                              | Successful payment evidence; paid time remains unknown when absent         |
| Payable `active` row with a Stripe session       | Successful Stripe payment evidence                                         |
| Payable imported active/previously-active row    | Successful imported payment evidence; lifecycle certainty remains inferred |
| Free active member                               | Membership preserved without a fake payment                                |
| `rejected` with no proof of completed payment    | Rejected state preserved; no success invented; rehearsal warning           |
| Audited board decision                           | Confirmed event with separate effective and recorded timestamps            |
| Bulk audit target contains comma-separated IDs   | Every old ID and metadata entry is remapped to the stable member           |
| `member.auto_approve` audit exists               | Renewal evidence only; no application approval event is fabricated         |
| No legacy reactivation audit exists              | No reactivation mapping or event is created                                |
| Legacy reactivation audit exists                 | Rehearsal requires explicit correction-or-rejoin classification            |
| Old local-midnight period timestamp              | Correct Helsinki calendar date, without UTC off-by-one                     |
| Several period rows for one user                 | One stable member; dependencies are rewired                                |
| Existing organization member                     | Preserved for manual management                                            |
| Historical rows                                  | No historical obligations are created                                      |
| Unknown payment time/amount/currency             | Nulls remain null; `createdAt` is not substituted                          |
| Delayed Stripe webhook after migration           | Retained session ID resolves to one attempt and updates idempotently       |
| Migration invariant fails                        | Transaction rolls back completely                                          |
| Two rehearsals use identical snapshot and inputs | Reports and migrated domain state are identical                            |
| Production database contains legacy members      | `membershipDataLiveAt` is set during cutover                               |

## Implementation and rollout

### Known blast radius

Implementation must update all consumers of the old period-shaped
`membershipId`, including schema and fixtures, application/session creation,
Stripe webhooks, member and admin queries, import, email/reminders, QR
verification, history UI, end-to-end tests, and developer documentation of
member statuses.

### Reviewable implementation slices

Keep code review small even though production has one cutover:

1. Add schema definitions, constraints, event replay, and pure domain tests.
2. Add the production migration, local rehearsal helper, and migration fixtures.
3. Replace legacy CSV import with preview, additive evidence, and inference.
4. Implement fee-period publication, application availability, obligations,
   renewal checkout, and Stripe webhook idempotency.
5. Migrate application, reapplication, student verification, paid type-change,
   and manual refund workflows.
6. Add overdue/reminder views, history/provenance UI, QR fee display, and the
   bulk non-payment action.

The Drizzle migration is merged with the code that understands the new schema;
the smaller slices are commits and review units, not independently deployed
database states.

### August-critical path

Before renewals open:

1. Finish schema/domain tests and the importer/migration rehearsal.
2. Run the exact migration against a recent production snapshot early enough to
   fix classifications well before deployment.
3. Reconcile rehearsal counts and explicitly classify every warning category.
4. Complete period publication, availability alerts, obligation creation,
   renewals, new applications, student verification, and new-period type
   changes.
5. Verify that the overdue preset excludes free, waived, newly joined, and paid
   members.
6. Complete the member-facing imported-data warning and preserve legally active
   QR behavior.

The admin-triggered reminders should be ready for the first renewal cycle. The
bulk board action and notice-retry workflow must be ready before the
November/December non-payment decisions, but they do not need to block opening
August payments if their data invariants and tests already exist.

### Cutover runbook

1. Announce a short write pause and disable application/payment/admin writes.
2. Take and verify a restorable production snapshot.
3. Run the already-rehearsed transactional Drizzle migration.
4. Run invariant queries and compare counts with the rehearsal report.
5. Smoke-test admin lists, one member history, application targeting and outage
   warning, Stripe checkout in test mode, renewal eligibility, and QR
   verification.
6. Re-enable writes and monitor Stripe webhooks, payment attempts, and errors.

If migration or validation fails, the transaction rolls back and the old
application remains in place. If a post-commit smoke test finds a blocking
problem, stop writes, restore the snapshot, and redeploy the old application.

### Production readiness gate

Do not open renewals until:

- the exact migration succeeds on a recent snapshot;
- all invariant checks pass with zero orphans and zero illegal type overlaps;
- every ambiguous classification is either accepted and documented or fixed;
- two independent rehearsal runs converge;
- Stripe webhook replay and delayed-webhook tests pass;
- publication retry creates no duplicate obligations;
- every purchasable type has one valid application target and alert deduplication
  passes;
- the board can obtain the exact active-and-unpaid list; and
- backup restoration has been exercised or otherwise verified.
