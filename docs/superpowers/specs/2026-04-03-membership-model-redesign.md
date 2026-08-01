# RFC: Indefinite Membership and Yearly Fees

> This PR is for design review and comments. It is not intended to be merged.
> Implementation will happen in separate PRs after the design is agreed.

## Problem

The current model inherited from kide.app treats every yearly payment as a new,
time-limited membership. That is convenient for selling memberships, but it
does not match how Finnish association membership works.

Membership continues until the member resigns or the board ends it. A yearly
fee is a separate obligation. The current model confuses those facts, which
creates false membership histories, unnecessary renewal approvals, and unclear
handling of unpaid members.

## Proposed model

The proposal separates five facts:

- **Member:** one stable record for the person's current legal membership.
- **Membership event:** durable history of joining, approval, type changes,
  resignation, expulsion, non-payment decisions, and corrections.
- **Fee period:** the yearly fee, due date, and earliest non-payment action date
  for one membership type.
- **Obligation:** records that a particular member was actually issued that
  fee.
- **Payment:** records Stripe, manual, and imported payment attempts.

This is not full event sourcing. The member row remains the simple current
snapshot; events preserve history.

## Decisions

### Membership does not expire with a fee period

An active member remains active when a due date passes. There is no
`payment_overdue` membership status and no automatic resignation.

Admins instead get a preset list of active members with an unpaid current
obligation. They can send reminders and, after the period's
`nonPaymentActionAt`, record the board's bulk decision to deem selected members
resigned. QR verification and other membership rights remain valid until that
decision.

The final membership status is neutral (`ended`). The event records whether the
reason was voluntary resignation, non-payment, or expulsion. Ending membership
also cancels its unsettled fees; rejoining creates or reopens the applicable
application fee instead of carrying old debt forward.

### One stable member record, with durable history

Resigning, rejoining, and changing type do not create new member records. A
member has at most one approved membership type at a time.

Membership events distinguish when a decision took effect from when it was
recorded. Confirmed events are immutable; correcting an admin mistake appends a
correction rather than rewriting history.

The existing audit log remains an operational/security log. It is not the
authoritative membership history.

### Obligations say who owes a fee

Publishing a fee period creates one obligation for each applicable active
member. Publishing is idempotent and does not create Stripe checkouts or send
messages. Published fee dates and deadlines are immutable.

Free membership types and zero-fee periods create no obligations. An admin may
activate a paid member without inventing a payment by explicitly waiving the
obligation with a reason.

Payment state is not duplicated on the obligation: it is paid when at least one
successful, non-refunded payment exists.

### Applications stay available and remain separate from renewals

A new or returning applicant selects a membership type. The admin chooses which
published fee period currently accepts applications, so an upcoming period can
be opened early without calendar-specific rules. The selected fee is the
applicant's first obligation; no earlier-period fee is created.

Paid applicants go through Stripe and then wait for board approval. Free
applicants skip payment but still wait for approval. Failed or abandoned
checkouts stay retryable and never become board rejections. Approval activates
membership immediately even when the paid fee period starts later: fee-period
dates never gate legal membership.

An active member only pays their new obligation. Renewal does not change
membership status or require approval. A type requiring student verification
requires valid verification before renewal payment; otherwise the member must
re-verify or request a paid, board-approved type change. Expired verification
alone never changes membership status.

A member joining late in one fee period still receives the next period's normal
renewal obligation, even if that later period was published before approval.

Every purchasable type must always have exactly one valid application target.
Applications cannot be intentionally paused. Admins see a persistent warning
and receive deduplicated email alerts before a target expires and if availability
is lost.

### Type changes happen during renewal

During a new fee period, an active member may select another eligible type
instead of renewing the old one. They pay the target fee and the change goes to
the board. Their old type remains active until approval.

Approval replaces the new-period obligation and keeps the continuous membership
start date. Rejection keeps the old type and marks the target payment for manual
refund. Mid-period exceptions remain admin-managed.

### Refunds and reminders stay manual

Refunds are rare enough that the application will not initiate them. It records
that a refund is required; an admin refunds through Stripe and verifies the
result in the application.

The first renewal cycle uses admin-triggered bulk reminders. Scheduled or
recurring reminders and Stripe Invoicing are out of scope.

## Legacy data

Historical kide.app data cannot prove every board decision. The import should
preserve what is known without presenting guesses as legal facts.

Imports are additive and order-independent:

- exact source dates are preserved;
- repeated rows are idempotent;
- a later partial CSV never deletes earlier evidence;
- confirmed admin decisions always override imported inference; and
- filling a historical gap rebuilds only the inferred events.

For Tietokilta, a missing historical fee is assumed to have ended membership on
December 1 of that fee period's starting year. This reflects the recent
November/December bulk-resignation practice, but it is explicitly labelled as
inferred, not as a recorded board decision.

Members whose current state depends on inference see a short warning and contact
information. A later confirmed action establishes authoritative current state;
historical inference remains visibly labelled.

Other associations choose their own historical calendar during onboarding.
Imports may be repeated until the admin explicitly finalizes import mode. At
finalization, the admin selects the last fully billed period for each type;
missing-fee inference never extends beyond those cutoffs. Afterward, CSV imports
may only add history from fee periods that began before the go-live boundary.

## Production migration

Production will use one transactional schema-and-data migration, with writes
briefly stopped and a database snapshot as the rollback source. There is no
dual-write period.

Before deployment, the exact migration is rehearsed locally against a recent
production snapshot. The report compares old and new counts, lists ambiguous
classifications and inferred events, checks invariants, and confirms that two
runs produce the same result.

The migration must not manufacture evidence:

- a Stripe session proves checkout started, not that it succeeded;
- `awaiting_payment` never becomes a successful payment;
- unknown payment dates and amounts remain unknown;
- free members do not receive fake payments; and
- historical obligations are not created retroactively.

## Scope and rollout

The August-critical work is the migration rehearsal, fee-period publication,
obligations, renewal checkout, applications, new-period type changes, overdue
filter, student re-verification, application-availability alerts, manual
reminders, and imported-data warning.

The bulk non-payment decision and notice retry workflow must be ready before the
November/December board actions, but do not need to block opening August
payments.

Custom member fields, organization CSV import, automatic reminders, automatic
refunds, post-publication deadline changes, partial payments, and installments
are outside this RFC.

Detailed schema fields, algorithms, scenario-based tests, and the cutover
checklist are in the
[implementation reference](./2026-04-03-membership-model-redesign-implementation.md).

## Review focus

Please focus comments on three questions:

1. Does the separation between legal membership, obligations, and payments
   match how the board should operate?
2. Is the legacy inference policy honest and practical enough without reviewing
   every imported member?
3. Is any essential August renewal scenario missing?
