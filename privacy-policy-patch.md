# Privacy Policy Patch: Data Retention and Audit Logging

## Overview

This document describes the data retention policies for audit logs in the Tietokilta membership registry system. These policies balance legal compliance requirements with GDPR data minimization principles.

## Audit Log Retention Policies

The system maintains audit logs with different retention periods based on the type of activity logged. Retention periods are determined automatically by the action prefix.

### 1. Security and Authentication Events (`auth.*`)

**Retention Period:** 180 days (6 months)

**Legal Basis:** No specific legal requirement; GDPR Article 5(1)(e) data minimization principle applies.

**Logged Activities:**

- User login attempts (`auth.login`)
- Failed login attempts (`auth.login_failed`)
- User logouts (`auth.logout`)
- Passkey registration (`auth.passkey_registered`)
- Passkey deletion (`auth.passkey_deleted`)

**Purpose:** Security monitoring, intrusion detection, and investigation of security incidents.

**Rationale:** Six months is sufficient for detecting security patterns and investigating incidents while respecting data minimization principles. IP addresses and user agents are retained during this period for security purposes.

---

### 2. Financial and Membership Events (`member.*`, `membership.*`)

**Retention Period:** 2,555 days (~7 years)

**Legal Basis:** Finnish Accounting Act (Kirjanpitolaki)

- Accounting vouchers: Minimum 6 years (§2a:2)
- Financial statements: Minimum 10 years (§2a:2)

**Logged Activities:**

**Member Events:**

- Member approval (`member.approve`) - Triggers billing
- Member rejection (`member.reject`) - Payment rejected
- Member expiration (`member.expire`) - Membership period ended
- Member cancellation (`member.cancel`) - Potential refund event
- Member reactivation (`member.reactivate`) - Resumes billing
- Member creation (`member.create`) - Initial purchase/payment

**Membership Product Events:**

- Membership type creation (`membership.create`) - New billable product
- Membership type deletion (`membership.delete`) - Removes pricing

**Purpose:** Financial auditing, tax compliance, payment dispute resolution, regulatory compliance.

**Rationale:** Seven years provides a safe middle ground between the 6-year minimum for vouchers and 10-year minimum for financial statements. These records may be necessary for:

- Tax audits
- Payment disputes
- Financial statement verification
- Regulatory compliance investigations

---

### 3. User Data Changes and Administrative Actions (`user.*`)

**Retention Period:** 1,095 days (3 years)

**Legal Basis:**

- GDPR Article 5(1)(d) - Data accuracy requirement
- GDPR Article 30 - Records of processing activities
- Best practice for accountability and dispute resolution

**Logged Activities:**

- Admin role granted (`user.promote_to_admin`)
- Admin role revoked (`user.demote_from_admin`)
- User accounts merged (`user.merge`)
- Primary email changed (`user.change_primary_email`)
- Profile information updated (`user.update_profile`) - Future implementation for name, municipality, etc.

**Purpose:**

- Demonstrate GDPR compliance (data accuracy)
- Administrative accountability
- Dispute resolution
- Fraud prevention and detection
- Member data verification

**Rationale:** Three years balances accountability needs with data minimization:

- Longer than security logs (more critical for accountability)
- Shorter than financial logs (not legally mandated)
- Covers typical dispute resolution timeframes
- Allows verification of historical data accuracy
- Provides audit trail for administrative actions affecting member rights

---

## Technical Implementation

### Automatic Cleanup

The system automatically deletes audit logs older than their retention period via the `cleanupOldAuditLogs()` function in `src/lib/server/db/cleanup.ts`.

Cleanup is performed based on:

1. Log creation timestamp (`created_at` field)
2. Action prefix pattern matching (`auth.*`, `member.*`, `membership.*`, `user.*`)

### Audit Log Contents

Each audit log entry contains:

- **Action type:** What happened (e.g., `user.change_primary_email`)
- **Timestamp:** When it occurred
- **User ID:** Who performed the action (if authenticated)
- **Target:** What was affected (type and ID)
- **Metadata:** Additional context (e.g., old/new values, affected email addresses)
- **IP Address:** Client IP address (for security and fraud detection)
- **User Agent:** Browser/client identification

### Data Access Rights

Under GDPR Article 15, members have the right to access their audit logs. The system should provide:

- All audit logs where they are the subject (`targetType: "user", targetId: <their ID>`)
- All audit logs where they performed the action (`userId: <their ID>`)

Logs are retained within the retention periods specified above, even if a user exercises their right to deletion, as these logs serve legitimate legal and accountability purposes under GDPR Article 17(3)(b) (legal obligations) and Article 17(3)(e) (legal claims).

---

## Privacy Policy Language (Draft)

### For Finnish Policy (Tietosuojaseloste)

**Henkilötietojen säilytysaika / Lokitiedot**

Järjestelmä tallentaa toimintalokit seuraavilla säilytysajoilla:

1. **Turvallisuus- ja kirjautumistapahtumat** (esim. kirjautumiset, epäonnistuneet kirjautumisyritykset): 6 kuukautta
   - Peruste: Tietoturvan valvonta ja GDPR:n tietojen minimointi -periaate

2. **Jäsenyys- ja maksutapahtumat** (esim. jäsenyyden hyväksyntä, peruutus, maksujen käsittely): noin 7 vuotta
   - Peruste: Kirjanpitolaki (tositteet 6 vuotta, tilinpäätökset 10 vuotta)

3. **Käyttäjätietojen muutokset** (esim. sähköpostiosoitteen vaihto, ylläpitäjäoikeuksien muutokset): 3 vuotta
   - Peruste: GDPR:n täsmällisyysvaatimus (5 artikla) ja vastuullisuusperiaate

Lokitiedot poistetaan automaattisesti säilytysajan päätyttyä. Lokitiedot voivat sisältää:

- Tapahtuman tyyppi ja ajankohta
- Toiminnon suorittaja
- Kohteen tiedot (esim. käyttäjätunnus)
- IP-osoite ja selaintiedot turvallisuussyistä
- Muutostiedot (vanhat ja uudet arvot)

---

### For English Policy (Privacy Policy)

**Data Retention Period / Audit Logs**

The system maintains audit logs with the following retention periods:

1. **Security and authentication events** (e.g., logins, failed login attempts): 6 months
   - Legal basis: Security monitoring and GDPR data minimization principle

2. **Membership and payment events** (e.g., membership approval, cancellation, payment processing): approximately 7 years
   - Legal basis: Finnish Accounting Act (vouchers 6 years, financial statements 10 years)

3. **User data changes** (e.g., email address changes, administrator role changes): 3 years
   - Legal basis: GDPR accuracy requirement (Article 5) and accountability principle

Audit logs are automatically deleted after their retention period expires. Audit logs may contain:

- Event type and timestamp
- User who performed the action
- Target information (e.g., user ID)
- IP address and browser information for security purposes
- Change details (old and new values)

---

## GDPR Article 30 Compliance

This retention policy should be documented in the Records of Processing Activities (Article 30):

**Processing Activity:** Audit Logging and Security Monitoring

- **Purpose:** Security monitoring, legal compliance, accountability, fraud prevention
- **Categories of data subjects:** Members, administrators, visitors (login attempts)
- **Categories of personal data:** User IDs, IP addresses, user agents, email addresses (in metadata), action types
- **Recipients:** System administrators (technical access only)
- **Retention periods:**
  - Security events: 6 months
  - Financial events: 7 years
  - User data changes: 3 years
- **Technical and organizational security measures:**
  - Database access controls
  - Automated deletion after retention period
  - Audit trail of database access
  - Encryption in transit and at rest

---

## Implementation Notes

### Current Status (2026-01-18)

✅ Audit logging implemented for:

- Authentication events
- Member status changes
- Admin role changes
- User merges
- Primary email changes

✅ Retention policy implemented with automatic cleanup

🔄 Future implementation needed:

- Profile field changes (name, municipality) - `user.update_profile` action defined but not yet used
- Audit log access UI for users (GDPR Article 15 compliance)

### Testing Retention Policy

To verify the cleanup function works correctly:

```bash
# In development environment
pnpm db:studio  # Open Drizzle Studio to inspect audit_log table
```

Then manually call the cleanup function or set test data with old timestamps to verify deletion logic.

---

## References

- **GDPR Articles:** 5(1)(d), 5(1)(e), 15, 17(3)(b), 17(3)(e), 30
- **Finnish Accounting Act (Kirjanpitolaki):** §2a:2
- **Finnish Data Protection Ombudsman:** Guidelines on association data processing
- **Implementation:** `src/lib/server/db/cleanup.ts`, `src/lib/server/audit.ts`
