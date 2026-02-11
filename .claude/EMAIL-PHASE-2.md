# Email System Phase 2: Business Requirements & Planning

## Current State (Phase 1)

Phase 1 delivers synchronous transactional emails for critical moments:

| Email | Trigger | Business Purpose |
|---|---|---|
| OTP code | Sign-in / email verification | Authentication |
| Payment received | Stripe payment completes (needs approval) | Confirm money received |
| Membership approved | Admin approves member | Welcome to the guild |
| Membership renewed | Auto-approved renewal payment | Confirm continued membership |

All emails are sent synchronously in the request handler. Failures are logged but don't block the operation. No queue, no scheduling, no retries beyond Mailgun's own delivery retries.

---

## Phase 2: What member and admin behaviors should improve?

### 1. Members don't know their membership is about to expire

**Problem:** Members discover their membership expired only when they try to use it. There's no proactive notification.

**Desired behavior:** Members receive a reminder before expiry so they can renew without a lapse.

**Scope:**
- Email N days before `membership.endDate` (configurable, e.g., 30 days and 7 days)
- Only for `active` memberships
- Include a direct link to renew
- Respect `user.isAllowedEmails` preference (currently unused in email sending)

**Requires:** Scheduled job infrastructure (cron/periodic task) to check upcoming expirations.

---

### 2. Members in "silent" status transitions get no feedback

**Problem:** Several admin actions change member status without notification:
- **Rejection** (`awaiting_approval` -> `cancelled`) - member paid, got a payment confirmation, then silence
- **Expiration** (`active` -> `expired`) - no notification at all
- **Cancellation** (`active` -> `cancelled`) - no notification
- **Reactivation** (`expired`/`cancelled` -> `active`) - member is active again but doesn't know

**Desired behavior:** Members are informed when their status changes, especially for rejection (they paid money and deserve an explanation).

**Scope:**
- Rejection email: explain outcome, mention refund process if applicable
- Expiration email: inform, link to renew
- Reactivation email: welcome back, confirm new status
- Cancellation email: confirm cancellation

**Requires:** New email templates and triggers in existing admin action handlers. No queue needed - same synchronous pattern as Phase 1.

---

### 3. Admins don't know when action is needed

**Problem:** Admins must proactively check the admin panel to see pending approvals. After a membership purchase wave (e.g., start of academic year), pending members may wait days.

**Desired behavior:** Admins receive a notification when members are waiting for approval.

**Scope:**
- Option A: Immediate notification per new pending member (could be noisy during waves)
- Option B: Daily/periodic digest of pending approvals (e.g., "5 members awaiting approval")
- Consider: which admin users should receive these? All admins? Configurable?

**Requires:** For Option A, just a new email in the webhook flow. For Option B, scheduled job infrastructure.

---

### 4. The `isAllowedEmails` preference is not enforced

**Problem:** `user.isAllowedEmails` exists in the schema but is not checked before sending emails. All emails are sent regardless of preference.

**Desired behavior:**
- Transactional emails (OTP, payment confirmation) are always sent - these are necessary for service operation
- Informational/marketing emails (expiry reminders, digests, announcements) respect the preference

**Scope:**
- Classify email types as `transactional` vs `informational`
- Check `isAllowedEmails` before sending informational emails
- Ensure the preference is exposed in user settings UI (if not already)

**Requires:** Minor change to `sendMemberEmail()` to check preference for non-transactional types.

---

### 5. No visibility into email delivery

**Problem:** If an email fails to send or bounces, nobody knows. Failures are logged to console but not tracked or surfaced.

**Desired behavior:** Admins can see whether important emails were delivered, and failures are retried or flagged.

**Scope (minimal):**
- Log email sends to an `email_log` table (recipient, type, status, timestamp, Mailgun message ID)
- Surface delivery failures in admin UI or as admin notifications
- Optional: Mailgun webhook for bounce/complaint tracking

**Scope (extended):**
- Automatic retry for transient failures
- Suppression list management (don't email addresses that bounced)
- Delivery rate tracking

**Requires:** New database table, minor changes to email service layer. Extended scope needs Mailgun webhook endpoint.

---

## Infrastructure Decision: Do we need a job queue?

Several Phase 2 features need scheduled execution:
- Expiry reminders (check daily for upcoming expirations)
- Admin digest emails (daily/weekly summary)
- Optional: retry failed emails

**Options:**

### A. PostgreSQL-based scheduling (simplest)
- Add a `scheduled_jobs` or `email_queue` table
- Run a periodic check via SvelteKit's server startup or an external cron
- Fits the existing stack (no new dependencies)
- Sufficient for low volume (Tietokilta likely has hundreds, not thousands, of members)

### B. pg-boss (PostgreSQL-native job queue)
- Full job queue built on PostgreSQL
- Handles scheduling, retries, concurrency, dead letter queue
- Adds one dependency but no new infrastructure
- Good if we expect job complexity to grow

### C. External cron (e.g., systemd timer, GitHub Actions scheduled workflow)
- Trigger a protected API endpoint on a schedule
- No in-process scheduling needed
- Simple but adds operational complexity

**Recommendation:** Start with Option A or an external cron (Option C) for the MVP. The volume is low enough that a simple daily check is sufficient. Migrate to pg-boss only if job complexity warrants it.

---

## Prioritized Implementation Order

Based on member experience impact:

1. **Enforce `isAllowedEmails`** - Quick win, prerequisite for adding more email types responsibly
2. **Status change notifications** (rejection, expiration, reactivation) - Biggest gap in member communication, especially rejection after payment
3. **Expiry reminders** - Proactive retention, requires scheduled infrastructure
4. **Email delivery logging** - Operational visibility
5. **Admin pending-approval notifications** - Quality of life for board members

---

## Open Questions

- What's the typical membership renewal volume? (drives infrastructure choice)
- Should rejection emails include a reason field? (admin would need to input this)
- Who should receive admin notifications - all admins or a configurable subset?
- Is there an existing external cron/scheduler (e.g., in the Nix/Docker deployment) that could trigger periodic tasks?
- Should email preferences be per-category (reminders vs. announcements) or a single toggle?
