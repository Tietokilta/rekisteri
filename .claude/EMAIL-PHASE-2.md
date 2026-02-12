# Email System Phase 2: Implementation Plan

## Context: Tietokilta Membership Lifecycle

All emails on this platform are membership-critical / transactional. The `isAllowedEmails`
field is for Google Group newsletter exports, not for this platform's email system.

### Bylaws Reference (Tietokilta säännöt)

- **§6**: Members are contacted via email. Sent email is assumed received on the day of sending.
- **§7**: Members pay a membership fee per academic year. The **annual meeting** (vuosikokous)
  determines the fee amount and **due date** (eräpäivä) for each member group separately.
- **§8 p1**: Voluntary resignation — member notifies board in writing.
- **§8 p2**: Deemed resigned — board can deem a member resigned if fee unpaid **2 months after
  due date**. Must send email notification.
- **§9**: Expulsion — must be delivered via email **without delay** (viipymättä).

### Typical Year Timeline

```
Jan/Feb  — Annual meeting (vuosikokous) sets fee amount and due date
           for each member group (§7).
           Admin creates next period's memberships with paymentDueDate.

~Aug     — 1 month before due date: first payment reminder email
           "Your membership fee is due [date]. Pay here: [link]"

~Sep 23  — 1 week before due date: second reminder

Sep 30   — Due date (typical): "Your membership fee is due today"
           (exact date varies yearly, set by annual meeting)

~Oct 30  — 1 month overdue: grace period reminder
           "Your fee is overdue. Pay to maintain your membership."

Dec      — Board eligible to deem resigned (2+ months after due date, §8 p2).
           Bulk "mark as resigned" action in admin UI.
           Resignation notification emails sent immediately (§8 p2).
```

### Member Status State Machine

```
awaiting_payment → active | awaiting_approval | rejected
awaiting_approval → active | rejected
active → resigned
resigned → active      (reactivation)
rejected → active      (reactivation)
```

Defined in `src/lib/server/utils/member.ts`. Aligned with bylaws:
- `resigned` = voluntary (§8 p1), deemed resigned for non-payment (§8 p2), or expelled (§9)
- `rejected` = board rejected application, or payment failed/expired

---

## Phase 1 (Complete)

Synchronous transactional emails:

| Email | Trigger | Notes |
|---|---|---|
| OTP code | Sign-in / email verification | Always sent |
| Payment received | Stripe webhook | Needs approval confirmation |
| Membership approved | Admin approves | Individual + bulk |
| Membership renewed | Auto-approved renewal | Via Stripe webhook |

---

## Phase 2 Scope

### 1. Data Model: `paymentDueDate` on `membership`

Add a nullable `paymentDueDate` column to the `membership` table.

```
membership:
  id, membershipTypeId, stripePriceId, startTime, endTime,
  requiresStudentVerification,
  paymentDueDate  ← NEW (nullable timestamp)
```

**Why on `membership`:** Each `membership` record already represents a specific year's offering
of a membership type (e.g., "Regular member 2026-2027"). The annual meeting sets the due date
per member group per year (§7), which maps exactly to this table. No separate period table needed.

- `null` = no payment reminders (initial purchases, legacy data, honorary members)
- Set by admin when creating next year's membership offerings
- Displayed and editable in admin membership management UI

### 2. Email Delivery Log Table

Single table serving as both delivery log and deduplication check for reminders.

```sql
email_log:
  id          TEXT PRIMARY KEY
  user_id     TEXT REFERENCES user(id)      -- who it was sent to
  email_type  TEXT NOT NULL                  -- e.g., 'membership_approved', 'payment_reminder_30d'
  related_member_id  TEXT                    -- nullable, for dedup (which member record triggered this)
  status      TEXT NOT NULL                  -- 'sent', 'failed'
  mailgun_message_id TEXT                    -- for correlation with Mailgun
  created_at  TIMESTAMP WITH TIME ZONE
  sent_at     TIMESTAMP WITH TIME ZONE
```

**GDPR considerations:**
- No email content stored, no recipient email address (derivable from userId if needed)
- Only type, user reference, and delivery status
- Cleanup: 180-day retention via existing cron infrastructure

**Serves two purposes:**
1. Delivery visibility — admins can check if emails were sent/failed
2. Reminder deduplication — "did we already send `payment_reminder_30d` for this member?"

### 3. Payment Due Date Reminders (Daily Cron)

Added to existing `node-cron` setup in `hooks.server.ts` (daily, alongside cleanup tasks).

**Schedule:** Weekdays at 10 AM Helsinki time (handles DST automatically):
```js
cron.schedule("0 10 * * 1-5", handler, { timezone: "Europe/Helsinki" });
```

**Logic:**
```
For each membership M where M.paymentDueDate is not null:
  Find users who are 'active' members of the same membershipType
  in a PREVIOUS period, AND who have NOT purchased M yet
  (no member record linking them to M).

  Based on days relative to M.paymentDueDate (ranges to handle weekends):
    28-30 days before: send 'payment_reminder_30d'  (if not already sent per email_log)
    5-7 days before:   send 'payment_reminder_7d'
    0-2 days after:    send 'payment_reminder_due'
    28-30 days after:  send 'payment_reminder_overdue'

  Dedup via email_log ensures only one email per type per member:
    first weekday in the window triggers the send,
    subsequent days in the window are skipped.
```

**Edge cases:**
- No new membership of same type exists → no reminders fire (correct — nothing to renew into)
- Membership type discontinued → no reminders, board handles communication separately
- Member already purchased new period → no reminder (they have a member record for M)
- Reminder milestone falls on weekend → sent on following Monday (range-based check + dedup)

### 4. Status Change Notification Emails (Immediate)

All status change emails sent **immediately** (not queued/batched). The confirmation dialogs
added in the state machine PR provide the safety net against accidental actions.

| Transition | Email Type | Notes |
|---|---|---|
| `→ active` (approve) | `membership_approved` | **Already exists** (Phase 1) |
| `→ active` (reactivate) | `membership_reactivated` | New: "Your membership has been reactivated" |
| `→ rejected` | `membership_rejected` | New: explain outcome |
| `→ resigned` (§8 p2 deemed) | `membership_resigned` | New: **required by bylaws** (§8 p2) |
| `→ resigned` (§8 p1 voluntary) | `membership_resigned` | New: confirm resignation recorded |
| `→ resigned` (§9 expulsion) | `membership_expelled` | New: **must be sent viipymättä** (§9) |

For bulk actions (`bulkApproveMembers`, `bulkMarkMembersResigned`): emails sent in parallel
via `Promise.allSettled`, same pattern as existing bulk approve emails.

**CSV import sends NO emails** (by design). Import is for historical/legacy data where members
are already aware of their status. See `admin/members/import/data.remote.ts`.

### 5. New Email Templates

| Template | Metadata | i18n keys needed |
|---|---|---|
| `membership_reactivated` | firstName, membershipName | emails.membershipReactivated.* |
| `membership_rejected` | firstName, membershipName, reason? | emails.membershipRejected.* |
| `membership_resigned` | firstName, membershipName, reason | emails.membershipResigned.* |
| `membership_expelled` | firstName | emails.membershipExpelled.* |
| `payment_reminder` | firstName, membershipName, dueDate, paymentLink | emails.paymentReminder.* |

All templates respect `user.preferredLanguage` for locale selection.

### 6. Cron Schedule (Extended)

```
hooks.server.ts ServerInit:
  "0 3 * * *"    — existing: cleanupExpiredTokens, cleanupOldAuditLogs
  "0 4 * * 0"    — existing: cleanupInactiveUsers (GDPR, 6yr)
  "0 10 * * 1-5" — NEW: payment reminder check (weekdays 10 AM Helsinki, tz-aware)
  "0 3 * * *"    — EXTEND: add email_log cleanup (180-day retention)
```

---

## Implementation Order

1. **DB migration**: add `paymentDueDate` to `membership`, create `email_log` table
2. **Email log integration**: wrap `sendMemberEmail` to log all sends to `email_log`
3. **Status change emails**: add templates + wire into admin actions (resign, reject, reactivate, expel)
4. **Payment reminder cron**: daily job with deduplication
5. **Admin UI**: expose `paymentDueDate` in membership create/edit forms
6. **Cleanup**: extend cron to prune old `email_log` rows

---

## Open Questions (Resolved)

| Question | Resolution |
|---|---|
| Queue vs immediate? | Immediate — confirmation dialogs provide safety net |
| `isAllowedEmails` enforcement? | Not for this platform — it's for Google Group exports |
| Admin notification emails? | Not needed — admins check weekly |
| Separate period table? | No — `membership` already represents type × period |
| What triggers reminders? | Existence of new membership with `paymentDueDate` + same type |
