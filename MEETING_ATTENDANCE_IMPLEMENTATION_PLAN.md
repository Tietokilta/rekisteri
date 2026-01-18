# Meeting Attendance Tracking System - Implementation Plan

## Overview

This document outlines the implementation plan for adding a meeting attendance tracking system to the Tietokilta membership registry. The system will allow moderators to scan member QR codes to track attendance at meetings, with support for different meeting states and CSV export.

## Requirements Summary

1. **QR Code System**: Each user has a unique QR code, moderators scan at the door
2. **Attendance Logging**: Track check-in/check-out with timestamps
3. **Meeting States**: upcoming, ongoing, recess, finished
4. **Member Counting**: Track current attendee count by membership type
5. **Recess Handling**: Two modes - short recess (keep state, continue scanning) or long recess (clear all, re-scan on resume)
6. **Manual Override**: Manual check-in/out in case of QR failure
7. **Confirmation UI**: Show name and action after QR scan for verification
8. **CSV Export**: Export full attendance log with meeting events
9. **Shared View Link**: Shareable link for view-only access (requires authentication, not admin)

---

## 1. Database Schema Changes

### 1.1 Add QR Token to User Table

```typescript
// Addition to src/lib/server/db/schema.ts

export const user = pgTable("user", {
  // ... existing fields ...
  attendanceQrToken: text(), // Unique token for QR code generation
});
```

**Migration**: Generate tokens for existing users during migration.

### 1.2 Meeting Table

```typescript
// New table in src/lib/server/db/schema.ts

export const MEETING_STATUS_VALUES = [
  "upcoming",
  "ongoing",
  "recess",
  "finished"
] as const;

export const meetingStatusEnum = pgEnum("meeting_status", MEETING_STATUS_VALUES);

export const meeting = pgTable("meeting", {
  id: text().primaryKey(),
  name: text().notNull(),
  description: text(),
  status: meetingStatusEnum().notNull().default("upcoming"),
  startedAt: timestamp({ withTimezone: true }), // Actual start time
  finishedAt: timestamp({ withTimezone: true }), // Actual finish time
  shareToken: text().unique(), // For shareable view-only link
  ...timestamps, // createdAt, updatedAt
});
```

### 1.3 Meeting Event Table (State Transitions)

```typescript
// Tracks meeting state changes (start, recess, resume, finish)

export const MEETING_EVENT_TYPE_VALUES = [
  "start",
  "recess_start",
  "recess_end",
  "finish"
] as const;

export const meetingEventTypeEnum = pgEnum("meeting_event_type", MEETING_EVENT_TYPE_VALUES);

export const meetingEvent = pgTable("meeting_event", {
  id: text().primaryKey(),
  meetingId: text()
    .notNull()
    .references(() => meeting.id, { onDelete: "cascade" }),
  eventType: meetingEventTypeEnum().notNull(),
  timestamp: timestamp({ withTimezone: true }).notNull().defaultNow(),
  triggeredBy: text()
    .references(() => user.id), // Admin who triggered the event
  notes: text(), // Optional notes (e.g., "Lunch break", "Day 2 resume")
  ...timestamps,
});
```

### 1.4 Attendance Table

```typescript
// Tracks individual check-in/check-out events

export const ATTENDANCE_EVENT_TYPE_VALUES = [
  "check_in",
  "check_out"
] as const;

export const attendanceEventTypeEnum = pgEnum(
  "attendance_event_type",
  ATTENDANCE_EVENT_TYPE_VALUES
);

export const SCAN_METHOD_VALUES = [
  "qr_scan",
  "manual"
] as const;

export const scanMethodEnum = pgEnum("scan_method", SCAN_METHOD_VALUES);

export const attendance = pgTable(
  "attendance",
  {
    id: text().primaryKey(),
    meetingId: text()
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id),
    eventType: attendanceEventTypeEnum().notNull(),
    timestamp: timestamp({ withTimezone: true }).notNull().defaultNow(),
    scanMethod: scanMethodEnum().notNull(),
    scannedBy: text().references(() => user.id), // Moderator who scanned
    ...timestamps,
  },
  (table) => [
    index("idx_attendance_meeting_id").on(table.meetingId),
    index("idx_attendance_user_id").on(table.userId),
  ]
);

// Relations
export const meetingRelations = relations(meeting, ({ many }) => ({
  events: many(meetingEvent),
  attendance: many(attendance),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  meeting: one(meeting, {
    fields: [attendance.meetingId],
    references: [meeting.id],
  }),
  user: one(user, {
    fields: [attendance.userId],
    references: [user.id],
  }),
  scannedByUser: one(user, {
    fields: [attendance.scannedBy],
    references: [user.id],
  }),
}));
```

### 1.5 Enums Addition

```typescript
// Add to src/lib/shared/enums.ts

export const MEETING_STATUS_VALUES = ["upcoming", "ongoing", "recess", "finished"] as const;
export type MeetingStatus = (typeof MEETING_STATUS_VALUES)[number];

export const MEETING_EVENT_TYPE_VALUES = ["start", "recess_start", "recess_end", "finish"] as const;
export type MeetingEventType = (typeof MEETING_EVENT_TYPE_VALUES)[number];

export const ATTENDANCE_EVENT_TYPE_VALUES = ["check_in", "check_out"] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPE_VALUES)[number];

export const SCAN_METHOD_VALUES = ["qr_scan", "manual"] as const;
export type ScanMethod = (typeof SCAN_METHOD_VALUES)[number];
```

---

## 2. QR Code Implementation

### 2.1 QR Token Generation

**File**: `src/lib/server/attendance/qr-token.ts`

```typescript
import { encodeBase64url } from "@oslojs/encoding";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

export function generateQrToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return encodeBase64url(bytes);
}

export async function ensureUserHasQrToken(userId: string): Promise<string> {
  const user = await db.query.user.findFirst({
    where: eq(table.user.id, userId),
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.attendanceQrToken) {
    return user.attendanceQrToken;
  }

  // Generate new token
  const token = generateQrToken();
  await db
    .update(table.user)
    .set({ attendanceQrToken: token })
    .where(eq(table.user.id, userId));

  return token;
}

export async function verifyQrToken(token: string): Promise<string | null> {
  const user = await db.query.user.findFirst({
    where: eq(table.user.attendanceQrToken, token),
  });

  return user?.id ?? null;
}
```

### 2.2 QR Code Generation (Client-Side)

**Package**: Install `qrcode` package

```bash
pnpm add qrcode
pnpm add -D @types/qrcode
```

**File**: `src/lib/components/attendance/user-qr-code.svelte`

```svelte
<script lang="ts">
  import QRCode from "qrcode";
  import { onMount } from "svelte";

  type Props = {
    token: string;
    userName: string;
  };

  let { token, userName }: Props = $props();

  let qrDataUrl = $state("");

  onMount(async () => {
    // Generate QR code as data URL
    const url = `${window.location.origin}/attendance/verify/${token}`;
    qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
    });
  });
</script>

<div class="flex flex-col items-center gap-4">
  {#if qrDataUrl}
    <img src={qrDataUrl} alt="Your attendance QR code" class="rounded-lg border" />
  {:else}
    <div class="h-[300px] w-[300px] animate-pulse rounded-lg bg-muted"></div>
  {/if}
  <p class="text-center text-sm text-muted-foreground">
    Show this QR code to the moderator for attendance tracking
  </p>
  <p class="text-center font-medium">{userName}</p>
</div>
```

### 2.3 QR Code Scanner (Admin)

**Package**: Install `html5-qrcode` package

```bash
pnpm add html5-qrcode
```

**File**: `src/lib/components/attendance/qr-scanner.svelte`

```svelte
<script lang="ts">
  import { Html5Qrcode } from "html5-qrcode";
  import { onMount, onDestroy } from "svelte";

  type Props = {
    onScan: (token: string) => void;
    onError?: (error: string) => void;
  };

  let { onScan, onError }: Props = $props();

  let scanner: Html5Qrcode | null = null;
  let isScanning = $state(false);

  onMount(async () => {
    scanner = new Html5Qrcode("qr-reader");

    try {
      await scanner.start(
        { facingMode: "environment" }, // Use back camera
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Extract token from URL
          const match = decodedText.match(/\/attendance\/verify\/([^\/]+)$/);
          if (match) {
            onScan(match[1]);
          } else {
            onError?.("Invalid QR code format");
          }
        },
        (errorMessage) => {
          // Ignore scanning errors (happens continuously)
        }
      );
      isScanning = true;
    } catch (err) {
      onError?.("Failed to start camera: " + String(err));
    }
  });

  onDestroy(async () => {
    if (scanner && isScanning) {
      await scanner.stop();
      scanner.clear();
    }
  });
</script>

<div id="qr-reader" class="rounded-lg overflow-hidden"></div>
```

### 2.4 Share Token for View-Only Access

**File**: `src/lib/server/attendance/share-token.ts`

```typescript
import { encodeBase64url } from "@oslojs/encoding";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return encodeBase64url(bytes);
}

export async function ensureMeetingHasShareToken(meetingId: string): Promise<string> {
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, meetingId),
  });

  if (!meeting) {
    throw new Error("Meeting not found");
  }

  if (meeting.shareToken) {
    return meeting.shareToken;
  }

  // Generate new token
  const token = generateShareToken();
  await db
    .update(table.meeting)
    .set({ shareToken: token })
    .where(eq(table.meeting.id, meetingId));

  return token;
}

export async function regenerateShareToken(meetingId: string): Promise<string> {
  const token = generateShareToken();
  await db
    .update(table.meeting)
    .set({ shareToken: token })
    .where(eq(table.meeting.id, meetingId));

  return token;
}

export async function verifyShareToken(token: string): Promise<string | null> {
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.shareToken, token),
  });

  return meeting?.id ?? null;
}
```

---

## 3. Route Structure

### 3.1 Admin Routes

```
src/routes/[locale=locale]/(app)/admin/meetings/
├── +page.svelte                    # List all meetings
├── +page.server.ts                 # Load meetings
├── create/
│   ├── +page.svelte                # Create meeting form
│   └── create.remote.ts            # Create meeting action
├── [meetingId]/
│   ├── +page.svelte                # Meeting detail/control panel
│   ├── +page.server.ts             # Load meeting data
│   ├── scan/
│   │   ├── +page.svelte            # QR scanner interface
│   │   └── +page.server.ts         # Load meeting for scanning
│   ├── attendees/
│   │   ├── +page.svelte            # Attendee list with manual check-in/out
│   │   └── +page.server.ts         # Load attendees
│   ├── export/
│   │   └── +server.ts              # CSV export endpoint
│   └── actions.remote.ts           # Meeting actions (start, recess, finish, etc.)
```

**Navigation**: Add to `src/lib/navigation.ts` in `getAdminNavItems()`:
```typescript
{
  title: LL.nav.admin.meetings(),
  href: route("/[locale=locale]/admin/meetings", { locale }),
  icon: Calendar, // from @lucide/svelte/icons/calendar
}
```

### 3.2 User Routes

```
src/routes/[locale=locale]/(app)/
├── +page.svelte                    # Dashboard with QR code (if has membership)
└── +page.server.ts                 # Load user data + QR token
```

**Note**: User's QR code is displayed directly on the dashboard page, not a separate route. Only shown if user has at least one active or expired membership. This is a general member verification QR code, not specific to attendance tracking (can be used for various validation purposes).

### 3.3 Shared View Routes

```
src/routes/[locale=locale]/(app)/meetings/
└── shared/
    └── [shareToken]/
        ├── +page.svelte            # View-only meeting attendance log
        └── +page.server.ts         # Load meeting data via share token
```

**Note**: This route is in the `(app)` group and outside `/admin/` so non-admin authenticated users can access it.

### 3.4 API Routes

```
src/routes/api/attendance/
├── scan/
│   └── +server.ts                  # Handle QR code scan (verify token, record attendance)
└── manual-checkin/
    └── +server.ts                  # Manual check-in/out endpoint
```

---

## 4. UI/UX Flow

### 4.1 Admin - Meeting Control Panel

**File**: `src/routes/[locale=locale]/admin/meetings/[meetingId]/+page.svelte`

**Features**:
- Meeting info header (name, description, status)
- State transition buttons:
  - `upcoming → ongoing`: "Start Meeting" button
  - `ongoing → recess`: "Start Recess" button with options:
    - **Short recess** (e.g., 15 min break): Keep current attendance state, continue scanning people in/out at door for accurate count
    - **Long recess** (e.g., overnight/multi-day): "Clear All Attendees" option - checks everyone out, then re-scan when meeting resumes
    - Optional notes field (e.g., "Lunch break", "Day 2 continuation")
  - `recess → ongoing`: "Resume Meeting" button
    - If cleared during recess: attendees must be re-scanned as they arrive
    - If not cleared: continue with current state
  - `ongoing → finished`: "End Meeting" button
- Current attendee count by membership type
- Timeline of meeting events (visual timeline)
- Quick actions: "Open Scanner", "View Attendees", "Export CSV"
- **Share Link Section**:
  - Display shareable link (generate if doesn't exist)
  - "Copy Link" button with visual feedback
  - "Regenerate Link" button (invalidates old link)
  - Description: "Share this link with meeting secretary/chair for view-only access (authentication required)"

### 4.2 Admin - QR Scanner Interface

**File**: `src/routes/[locale=locale]/admin/meetings/[meetingId]/scan/+page.svelte`

**Features**:
- Live camera feed with QR scanner
- Confirmation modal after scan:
  - Shows user name, photo (if available), membership type
  - Shows action: "Check In" or "Check Out" (based on last event)
  - Confirm/Cancel buttons
- Recent scans list (last 10, with timestamps)
- Sound/vibration feedback on successful scan
- Error handling for invalid/duplicate scans

### 4.3 Admin - Attendee List

**File**: `src/routes/[locale=locale]/admin/meetings/[meetingId]/attendees/+page.svelte`

**Features**:
- Searchable/filterable table of all users
- Columns: Name, Membership Type, Status (In/Out), Last Action, Manual Actions
- Filter by: Currently In, All Users, By Membership Type
- Manual check-in/out buttons per user
- Bulk actions:
  - "Check Out All" - Used for long recess to clear everyone before multi-day break
  - Confirmation required for bulk actions
- Real-time updates (optional: use polling or WebSockets)

### 4.4 User - Member QR Code on Dashboard

**File**: `src/routes/[locale=locale]/(app)/+page.svelte` (Dashboard)

**Component**: `src/lib/components/member-qr-modal.svelte` (new component - full screen dialog)

**Display Logic**:
- Only show QR code card if user has at least one active OR expired membership
- Hide if user has never had a membership (no membership = no verification needed)

**UI Approach - Full Screen Modal**:
- **Button on dashboard**: "Show Member Card" or QR icon button
- **Native `<dialog>` element**: Opens in full screen mode
- **Explicit user action required**: User must click button to open dialog
- **Brightness boost**: When dialog opens, automatically maximize screen brightness
- **Brightness restoration**: When dialog closes, restore original brightness setting
- **Consistent position**: QR code always centered on screen, no scrolling needed
- QR code display: Large and clear (250-300px) for easy scanning
- User's full name displayed prominently
- Generic title: "Member Verification" or "Member Card"
- Instructions: "Show this for member verification" (not attendance-specific)
- Close button (X) and backdrop click to dismiss
- Dark mode support: QR code inverts properly (black on white for scanning)
- Smooth open/close animation

**Purpose**:
- General member verification tool (not just for attendance)
- Can be used for: meeting check-in, event access, member discounts, etc.
- Admin scanner will show context (meeting name if scanning for attendance)

**Dashboard Integration**:
- Button positioned alongside MembershipCard
- Simple button or icon to trigger modal
- Minimal dashboard footprint when closed
- Full screen takeover when open for maximum visibility

**Implementation Example**:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let dialog: HTMLDialogElement;
  let wakeLock: WakeLockSentinel | null = null;
  let originalBrightness: string | null = null;

  async function openQRCode() {
    dialog.showModal();

    // Request wake lock to keep screen on
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.error('Wake Lock error:', err);
      }
    }

    // Boost brightness visually
    originalBrightness = dialog.style.filter;
    dialog.style.filter = 'brightness(1.5)';
  }

  function closeQRCode() {
    // Release wake lock
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }

    // Restore brightness
    if (originalBrightness !== null) {
      dialog.style.filter = originalBrightness;
    }

    dialog.close();
  }
</script>

<button onclick={openQRCode}>Show Member Card</button>

<dialog bind:this={dialog} class="full-screen-qr-modal">
  <div class="modal-content">
    <button onclick={closeQRCode} class="close-button">×</button>
    <h2>Member Card</h2>
    <div class="qr-code">
      <!-- QR code rendered here -->
    </div>
    <p class="user-name">{userName}</p>
    <p class="instructions">Show this for member verification</p>
  </div>
</dialog>

<style>
  .full-screen-qr-modal {
    max-width: 100vw;
    max-height: 100vh;
    width: 100vw;
    height: 100vh;
    padding: 0;
    border: none;
    background: var(--background);
  }

  .full-screen-qr-modal::backdrop {
    background: rgba(0, 0, 0, 0.8);
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 2rem;
  }
</style>
```

### 4.5 Shared View - Meeting Attendance Log (View-Only)

**File**: `src/routes/[locale=locale]/meetings/shared/[shareToken]/+page.svelte`

**Access Control**: Requires authentication (any signed-in user), but **NOT** admin privileges

**Features**:
- **Read-only banner**: Clear indication this is a view-only page
- **Meeting header**: Name, description, status, date/time range
- **Meeting timeline**: Visual timeline of all meeting events (start, recess, resume, finish)
- **Attendee statistics**:
  - Total unique attendees
  - Current attendees (if meeting ongoing)
  - Breakdown by membership type (pie chart or bar chart)
- **Attendance table**: Similar to admin view but read-only
  - Columns: Name, Membership Type, Check In Time, Check Out Time, Duration
  - Sortable and searchable
  - Filter by membership type
  - Show check-in/out pairs (handle multiple pairs per user if recess occurred)
- **Event log**: Chronological list of all meeting events with timestamps
- **Export CSV**: Button to download CSV (same format as admin export)
- **No admin actions**: No buttons for scanning, manual check-in/out, or state transitions
- **Refresh data**: Auto-refresh every 30 seconds if meeting is ongoing (optional)

**Server-side validation** (`+page.server.ts`):
```typescript
import { error, redirect } from "@sveltejs/kit";
import { route } from "$lib/ROUTES";
import { verifyShareToken } from "$lib/server/attendance/share-token";

export async function load({ params, locals, url }) {
  const { user } = locals;

  // Require authentication (see section 8.3 for redirect implementation)
  if (!user) {
    const signInUrl = route("/[locale=locale]/sign-in", { locale: locals.locale });
    throw redirect(302, `${signInUrl}?redirect=${encodeURIComponent(url.pathname)}`);
  }

  // Verify share token
  const meetingId = await verifyShareToken(params.shareToken);
  if (!meetingId) {
    throw error(404, "Meeting not found or link is invalid");
  }

  // Load meeting data (no admin check needed!)
  const meeting = await loadMeetingData(meetingId);

  return { meeting };
}
```

---

## 5. CSV Export Format

### 5.1 Meeting Attendance Export

**Endpoint**: `GET /[locale]/admin/meetings/[meetingId]/export`

**Format**:
```csv
Meeting Name,Meeting Start,Meeting End,Total Duration (minutes)
"General Assembly 2026",2026-01-17 14:00:00,2026-01-17 18:30:00,270

Event Type,Timestamp,Notes
START,2026-01-17 14:00:00,
RECESS_START,2026-01-17 15:30:00,Coffee break
RECESS_END,2026-01-17 15:45:00,
FINISH,2026-01-17 18:30:00,

User Name,Email,Membership Type,Check In,Check Out,Duration (minutes),Scan Method,Scanned By
"John Doe",john@example.com,Regular Member,2026-01-17 14:05:00,2026-01-17 18:28:00,263,qr_scan,admin@example.com
"Jane Smith",jane@example.com,Student Member,2026-01-17 14:02:00,2026-01-17 15:29:00,87,qr_scan,admin@example.com
"Jane Smith",jane@example.com,Student Member,2026-01-17 15:46:00,2026-01-17 18:30:00,164,qr_scan,admin@example.com

Summary
Total Unique Attendees,42
Total Check-ins,45
By Membership Type:
Regular Member,25
Student Member,17
```

### 5.2 Implementation

**File**: `src/lib/server/attendance/export.ts`

```typescript
import Papa from "papaparse";
import type { Meeting, MeetingEvent, Attendance } from "$lib/server/db/schema";

export function generateAttendanceCSV(
  meeting: Meeting,
  events: MeetingEvent[],
  attendance: Attendance[],
  users: Record<string, { name: string; email: string; membershipType: string }>
): string {
  // Build CSV sections
  const sections = [];

  // Section 1: Meeting header
  sections.push(Papa.unparse([
    ["Meeting Name", "Meeting Start", "Meeting End", "Total Duration (minutes)"],
    [meeting.name, meeting.startedAt, meeting.finishedAt, calculateDuration(meeting)],
  ]));

  // Section 2: Meeting events
  sections.push("\n\n");
  sections.push(Papa.unparse({
    fields: ["Event Type", "Timestamp", "Notes"],
    data: events.map(e => [e.eventType, e.timestamp, e.notes || ""]),
  }));

  // Section 3: Attendance records
  sections.push("\n\n");
  sections.push(Papa.unparse({
    fields: [
      "User Name",
      "Email",
      "Membership Type",
      "Check In",
      "Check Out",
      "Duration (minutes)",
      "Scan Method",
      "Scanned By"
    ],
    data: buildAttendanceRows(attendance, users),
  }));

  // Section 4: Summary
  sections.push("\n\nSummary\n");
  sections.push(buildSummary(attendance, users));

  return sections.join("");
}
```

---

## 6. Real-time Updates (Optional Enhancement)

For a better user experience, consider implementing real-time updates on the attendee list using:

1. **Server-Sent Events (SSE)**: Simple, one-way updates from server to client
2. **WebSockets**: Bidirectional communication
3. **Polling**: Simple but less efficient

**Recommendation**: Start without real-time updates, add if needed later.

---

## 7. Security Considerations

1. **QR Token Security**:
   - Tokens should be long (32 bytes) and random
   - Store tokens securely (consider hashing if needed)
   - Tokens should be unique per user
   - **Rotation vs Static**:
     - **Static tokens (recommended)**: Permanent QR code per user, simple and convenient
     - **Rotating tokens**: More secure but adds complexity (users need to refresh QR code)
     - **Mitigation without rotation**:
       - Human confirmation: Scanner always shows user's name for verification
       - Context awareness: Scanner shows what the QR code is being used for (meeting name, event, etc.)
       - Rate limiting: Prevent same QR code being scanned multiple times rapidly
       - Audit logging: Track all QR code uses for security review
       - Revocation: Ability to regenerate user's QR token if compromised (admin action)
     - **Best practice**: Start with static tokens + human confirmation. Only add rotation if abuse is detected.

2. **Share Token Security**:
   - Share tokens should be long (32 bytes) and random
   - Tokens should be unique per meeting
   - Store tokens in plaintext (needed for URL lookup, similar to session tokens)
   - Tokens can be regenerated to invalidate old links
   - Shared links require authentication (prevents anonymous access)
   - Shared links are view-only (no write operations possible)
   - Consider logging access to shared views for audit trail

3. **Authorization**:
   - Only admins can access meeting control panel
   - Only admins can scan QR codes
   - Only admins can generate/regenerate share links
   - Users can only view their own QR code and history
   - Any authenticated user can access shared view (with valid token)

4. **Rate Limiting**:
   - Limit QR scans per user per minute (prevent spam)
   - Use existing `ExpiringTokenBucket` pattern
   - Consider rate limiting share link regeneration

5. **Audit Logging**:
   - Log all meeting state changes (use existing `auditLog` table)
   - Log all attendance events
   - Track who performed each action
   - Log share link generation/regeneration
   - Optionally log access to shared views

6. **Sign-In Redirect Security** (Important for Shared Views):
   - Implement secure redirect-after-login functionality
   - Only allow redirects to same-origin pathnames (prevent open redirects)
   - Validate redirect parameter using URL constructor with own origin
   - Preserve redirect parameter through auth flow (sign-in → email verification → success)
   - Use query parameter: `?redirect=/meetings/shared/abc123`

---

## 8. i18n Translations

### 8.1 Finnish (fi)

Add to `src/lib/i18n/fi/index.ts`:

```typescript
// Add to nav.admin section:
nav: {
  admin: {
    // ... existing items ...
    meetings: "Kokoukset",
  },
},

// Add new member card and attendance sections:
memberCard: {
  title: "Jäsenkortti",
  verification: "Jäsentodistus",
  instructions: "Näytä tämä QR-koodi jäsentodistusta varten",
  yourName: "Sinun nimesi",
},

attendance: {
  title: "Läsnäololista",

  meetings: {
    title: "Kokoukset",
    create: "Luo kokous",
    name: "Kokouksen nimi",
    description: "Kuvaus",
    status: "Tila",

    statuses: {
      upcoming: "Tuleva",
      ongoing: "Käynnissä",
      recess: "Tauko",
      finished: "Päättynyt",
    },

    actions: {
      start: "Aloita kokous",
      startRecess: "Aloita tauko",
      resumeMeeting: "Jatka kokousta",
      finishMeeting: "Lopeta kokous",
      rescanAll: "Skannaa kaikki uudelleen tauon jälkeen",
      openScanner: "Avaa skanneri",
      viewAttendees: "Näytä osallistujat",
      exportCsv: "Vie CSV",
    },

    share: {
      title: "Jaa näkymä",
      description: "Jaa tämä linkki kokouksen sihteerille tai puheenjohtajalle katseluoikeutta varten (vaatii kirjautumisen)",
      copyLink: "Kopioi linkki",
      regenerateLink: "Luo uusi linkki",
      linkCopied: "Linkki kopioitu!",
      linkRegenerated: "Uusi linkki luotu (vanha linkki ei enää toimi)",
      confirmRegenerate: "Haluatko varmasti luoda uuden linkin? Vanha linkki lakkaa toimimasta.",
    },

    sharedView: {
      title: "Jaettu näkymä - Katseluoikeus",
      readOnlyBanner: "Tämä on vain katselua varten. Et voi muokata tietoja.",
      statistics: "Tilastot",
      eventLog: "Tapahtumaloki",
      refreshing: "Päivitetään...",
      lastUpdated: "Viimeksi päivitetty: {time}",
    },
  },

  scanner: {
    title: "QR-skanneri",
    scanning: "Skannaa QR-koodi...",
    confirmScan: "Vahvista skannaus",
    checkIn: "Kirjaa sisään",
    checkOut: "Kirjaa ulos",
    confirm: "Vahvista",
    cancel: "Peruuta",
    recentScans: "Viimeisimmät skannaukset",
    errorInvalid: "Virheellinen QR-koodi",
    errorAlreadyIn: "Käyttäjä on jo kirjautunut sisään",
    errorAlreadyOut: "Käyttäjä on jo kirjautunut ulos",
  },

  attendees: {
    title: "Osallistujat",
    currentlyIn: "Paikalla nyt",
    totalAttendees: "Osallistujia yhteensä",
    byType: "Jäsentyypeittäin",
    search: "Hae osallistujia...",
    manualCheckIn: "Kirjaa sisään",
    manualCheckOut: "Kirjaa ulos",
    checkOutAll: "Kirjaa kaikki ulos",
    lastAction: "Viimeisin toiminto",
    status: "Tila",
    in: "Sisällä",
    out: "Ulkona",
  },
},
```

### 8.2 English (en)

Add to `src/lib/i18n/en/index.ts` (similar structure in English).

### 8.3 Secure Sign-In Redirect Implementation

**Important**: This is a general authentication improvement needed for the shared view feature (and beneficial application-wide).

#### Implementation

**File**: `src/lib/server/auth/redirect.ts` (new file)

```typescript
import { dev } from "$app/environment";

/**
 * Validates a redirect URL to prevent open redirect attacks.
 * Only allows redirects to same-origin pathnames.
 *
 * @param redirectParam - The redirect parameter from query string
 * @param origin - The application's origin (e.g., from event.url.origin)
 * @returns The validated pathname or null if invalid
 */
export function validateRedirect(redirectParam: string | null, origin: string): string | null {
  if (!redirectParam) {
    return null;
  }

  try {
    // Try to construct a URL with our origin to validate the path
    const url = new URL(redirectParam, origin);

    // SECURITY: Only allow same-origin redirects
    if (url.origin !== origin) {
      return null;
    }

    // Return just the pathname + search + hash (no origin)
    return url.pathname + url.search + url.hash;
  } catch {
    // If URL parsing fails, treat it as invalid
    return null;
  }
}

/**
 * Gets the redirect URL from query params and validates it.
 * Falls back to a default path if validation fails.
 *
 * @param url - The request URL object
 * @param defaultPath - Default path if redirect is invalid (default: "/")
 * @returns A validated pathname
 */
export function getValidatedRedirect(url: URL, defaultPath = "/"): string {
  const redirectParam = url.searchParams.get("redirect");
  const validated = validateRedirect(redirectParam, url.origin);
  return validated ?? defaultPath;
}
```

#### Update Sign-In Flow

**File**: `src/routes/[locale=locale]/(auth)/sign-in/+page.server.ts`

```typescript
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { emailCookieName } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";
import { getValidatedRedirect } from "$lib/server/auth/redirect";

export const load: PageServerLoad = async (event) => {
  if (event.locals.user) {
    // User already logged in, redirect to requested page or home
    const redirectTo = getValidatedRedirect(
      event.url,
      route("/[locale=locale]", { locale: event.locals.locale })
    );
    redirect(302, redirectTo);
  }

  // If email cookie exists, redirect to OTP verification page
  // IMPORTANT: Preserve redirect parameter!
  const emailCookie = event.cookies.get(emailCookieName);
  if (emailCookie) {
    const redirectParam = event.url.searchParams.get("redirect");
    const verifyUrl = route("/[locale=locale]/sign-in/email", {
      locale: event.locals.locale
    });

    // Preserve redirect parameter through the flow
    const finalUrl = redirectParam
      ? `${verifyUrl}?redirect=${encodeURIComponent(redirectParam)}`
      : verifyUrl;

    redirect(302, finalUrl);
  }

  return {
    // Pass redirect param to page for form submission
    redirectTo: event.url.searchParams.get("redirect"),
  };
};
```

**File**: `src/routes/[locale=locale]/(auth)/sign-in/method/+page.server.ts`

```typescript
// Similar changes: preserve redirect parameter when navigating to email input
export const load: PageServerLoad = async (event) => {
  // ... existing logic ...

  return {
    redirectTo: event.url.searchParams.get("redirect"),
  };
};
```

**File**: `src/routes/[locale=locale]/(auth)/sign-in/email/+page.server.ts`

```typescript
export const load: PageServerLoad = async (event) => {
  // ... existing logic ...

  return {
    redirectTo: event.url.searchParams.get("redirect"),
  };
};
```

**File**: `src/routes/[locale=locale]/(auth)/sign-in/email/data.remote.ts`

```typescript
import { getValidatedRedirect } from "$lib/server/auth/redirect";

export const verifyCode = form(verifyCodeSchema, async ({ code }) => {
  const event = getRequestEvent();

  // ... existing verification logic ...

  const token = generateSessionToken();
  await createSession(token, userId);
  setSessionTokenCookie(event, token, new Date(Date.now() + 1000 * 60 * 60 * 24 * 30));

  await auditLogin(event, userId);

  deleteEmailCookie(event);
  deleteEmailOTP(otp.id);
  deleteEmailOTPCookie(event);

  // NEW: Use validated redirect
  const redirectTo = getValidatedRedirect(
    event.url,
    route("/[locale=locale]", { locale: event.locals.locale })
  );

  redirect(302, redirectTo);
});
```

#### Update Form Components

**File**: `src/routes/[locale=locale]/(auth)/sign-in/method/+page.svelte`

```svelte
<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Preserve redirect in form action URL
  const actionUrl = data.redirectTo
    ? `?/sendEmail&redirect=${encodeURIComponent(data.redirectTo)}`
    : "?/sendEmail";
</script>

<form method="POST" action={actionUrl}>
  <!-- form fields -->
</form>
```

#### Usage in Protected Routes

**Example**: Shared view route (already shown in section 4.6)

```typescript
// src/routes/[locale=locale]/meetings/shared/[shareToken]/+page.server.ts
export async function load({ params, locals, url }) {
  const { user } = locals;

  if (!user) {
    // Construct redirect URL with current path
    const redirectPath = url.pathname;
    const signInUrl = route("/[locale=locale]/sign-in", { locale: locals.locale });
    throw redirect(302, `${signInUrl}?redirect=${encodeURIComponent(redirectPath)}`);
  }

  // ... rest of logic
}
```

#### Testing

Add tests to verify redirect security:

```typescript
// Test cases for src/lib/server/auth/redirect.test.ts
describe("validateRedirect", () => {
  const origin = "https://example.com";

  it("allows same-origin pathname", () => {
    expect(validateRedirect("/meetings/shared/abc123", origin)).toBe("/meetings/shared/abc123");
  });

  it("allows pathname with query params", () => {
    expect(validateRedirect("/admin?tab=meetings", origin)).toBe("/admin?tab=meetings");
  });

  it("blocks different origin", () => {
    expect(validateRedirect("https://evil.com/phishing", origin)).toBeNull();
  });

  it("blocks protocol-relative URLs", () => {
    expect(validateRedirect("//evil.com/phishing", origin)).toBeNull();
  });

  it("blocks javascript: URLs", () => {
    expect(validateRedirect("javascript:alert(1)", origin)).toBeNull();
  });

  it("handles null/undefined", () => {
    expect(validateRedirect(null, origin)).toBeNull();
    expect(validateRedirect(undefined, origin)).toBeNull();
  });
});
```

#### Security Notes

1. **Always validate with URL constructor**: This prevents bypasses like `//evil.com`
2. **Compare origins**: Only allow same-origin redirects
3. **Return pathname only**: Never return full URL from validation
4. **URL encode when passing**: Always use `encodeURIComponent()` in query params
5. **Preserve through flow**: Pass redirect param through all auth steps
6. **Test edge cases**: Test protocol-relative, javascript:, data: URLs

---

## 9. Migration Steps

1. **Schema Migration**:
   ```bash
   # After adding schema changes
   pnpm db:generate
   pnpm db:migrate
   ```

2. **Generate QR Tokens for Existing Users**:
   Create migration script: `src/lib/server/db/migrations/generate-qr-tokens.ts`

3. **Update Dependencies**:
   ```bash
   pnpm add qrcode html5-qrcode
   pnpm add -D @types/qrcode
   ```

4. **Add i18n Translations**:
   - Update `src/lib/i18n/fi/index.ts`
   - Update `src/lib/i18n/en/index.ts`
   - Run `pnpm i18n:generate`

5. **Test**:
   - Create test meeting
   - Test QR code generation/scanning
   - Test state transitions
   - Test CSV export
   - Test manual check-in/out
   - Test share link generation and access
   - Test share link regeneration (invalidate old)

---

## 10. Implementation Order

### Phase 0: Secure Redirect (Prerequisite)
1. Create redirect validation utilities (`src/lib/server/auth/redirect.ts`)
2. Update sign-in page load function to handle redirect param
3. Update email verification flow to preserve redirect param
4. Update form components to pass redirect through
5. Add unit tests for redirect validation
6. Test redirect flow end-to-end

**Note**: This phase improves authentication UX application-wide and is required for shared view feature.

### Phase 1: Database & Core Logic
1. Add enums to `src/lib/shared/enums.ts`
2. Add database schema to `src/lib/server/db/schema.ts`
3. Create migration and run it
4. Create QR token utilities (`src/lib/server/attendance/qr-token.ts`)
5. Create attendance logic utilities (`src/lib/server/attendance/index.ts`)

### Phase 2: Member QR Modal on Dashboard
1. Create member QR modal component (`src/lib/components/member-qr-modal.svelte`)
2. Update dashboard to load QR token (if user has membership)
3. Add trigger button to dashboard (alongside MembershipCard)
4. Add i18n translations (generic member verification, not attendance-specific)
5. Add conditional rendering (only show button if active/expired membership exists)

### Phase 3: Admin Meeting Management
1. Add "Meetings" nav item to `src/lib/navigation.ts` (getAdminNavItems)
2. Create meetings list page
3. Create meeting creation form
4. Create meeting detail/control panel
5. Implement state transition actions

### Phase 4: QR Scanner
1. Create scanner page
2. Implement QR scanner component
3. Implement scan confirmation UI
4. Connect to backend API

### Phase 5: Attendee Management
1. Create attendee list page
2. Implement manual check-in/out
3. Add filtering/searching

### Phase 6: CSV Export
1. Implement CSV generation logic
2. Create export endpoint
3. Test various scenarios

### Phase 7: Shared View Link
1. Create share token utilities
2. Add share link UI to admin control panel
3. Create shared view page
4. Test authentication flow
5. Test share link regeneration

### Phase 8: Polish & Testing
1. Add error handling
2. Add loading states
3. Add success/error toasts
4. Test full flow end-to-end
5. Add audit logging

---

## 11. File Checklist

### New Files to Create

#### Database
- [ ] Migration: `drizzle/migrations/XXXX_add_meeting_attendance.sql`
- [ ] Migration script: `src/lib/server/db/migrations/generate-qr-tokens.ts`

#### Server Logic
- [ ] `src/lib/server/auth/redirect.ts` (secure redirect validation)
- [ ] `src/lib/server/attendance/qr-token.ts`
- [ ] `src/lib/server/attendance/share-token.ts` (share link tokens)
- [ ] `src/lib/server/attendance/index.ts` (core logic)
- [ ] `src/lib/server/attendance/export.ts` (CSV generation)

#### Components
- [ ] `src/lib/components/member-qr-modal.svelte` (full screen dialog for QR code - general member verification)
- [ ] `src/lib/components/attendance/qr-scanner.svelte` (admin scanner for meetings)
- [ ] `src/lib/components/attendance/scan-confirmation-modal.svelte`
- [ ] `src/lib/components/attendance/meeting-timeline.svelte`
- [ ] `src/lib/components/attendance/attendee-count-cards.svelte`

#### Shared View Routes
- [ ] `src/routes/[locale=locale]/(app)/meetings/shared/[shareToken]/+page.svelte`
- [ ] `src/routes/[locale=locale]/(app)/meetings/shared/[shareToken]/+page.server.ts`

#### Admin Routes - Meetings
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/+page.svelte`
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/+page.server.ts`
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/create/+page.svelte`
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/create/create.remote.ts`

#### Admin Routes - Meeting Detail
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/[meetingId]/+page.svelte`
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/[meetingId]/+page.server.ts`
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/[meetingId]/actions.remote.ts`
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/[meetingId]/scan/+page.svelte`
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/[meetingId]/scan/+page.server.ts`
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/[meetingId]/attendees/+page.svelte`
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/[meetingId]/attendees/+page.server.ts`
- [ ] `src/routes/[locale=locale]/(app)/admin/meetings/[meetingId]/export/+server.ts`

#### API Routes
- [ ] `src/routes/api/attendance/scan/+server.ts`
- [ ] `src/routes/api/attendance/manual-checkin/+server.ts`

### Files to Modify

#### Core Schema & Config
- [ ] `src/lib/shared/enums.ts` (add meeting/attendance enums)
- [ ] `src/lib/server/db/schema.ts` (add tables)
- [ ] `src/lib/i18n/fi/index.ts` (add translations)
- [ ] `src/lib/i18n/en/index.ts` (add translations)
- [ ] `src/lib/navigation.ts` (add admin meetings nav item)
- [ ] `package.json` (add dependencies)

#### Dashboard Integration
- [ ] `src/routes/[locale=locale]/(app)/+page.svelte` (add QR modal trigger button to dashboard)
- [ ] `src/routes/[locale=locale]/(app)/+page.server.ts` (load QR token if has membership)

#### Authentication Flow (Secure Redirect - Section 8.3)
- [ ] `src/routes/[locale=locale]/(auth)/sign-in/+page.server.ts` (add redirect support)
- [ ] `src/routes/[locale=locale]/(auth)/sign-in/method/+page.server.ts` (preserve redirect param)
- [ ] `src/routes/[locale=locale]/(auth)/sign-in/method/+page.svelte` (pass redirect to form)
- [ ] `src/routes/[locale=locale]/(auth)/sign-in/email/+page.server.ts` (preserve redirect param)
- [ ] `src/routes/[locale=locale]/(auth)/sign-in/email/data.remote.ts` (use validated redirect)

---

## 12. Estimated Effort

- **Secure Redirect Implementation**: 2-3 hours (auth improvement, required for shared view)
- **Database Schema**: 2-3 hours
- **QR Token System**: 2-3 hours
- **User QR Display**: 2-3 hours
- **Admin Meeting Management**: 4-6 hours
- **QR Scanner**: 4-6 hours
- **Attendee Management**: 4-6 hours
- **CSV Export**: 3-4 hours
- **Shared View Link**: 3-4 hours
- **Testing & Polish**: 4-6 hours

**Total**: 30-44 hours

---

## 13. Future Enhancements

1. **Real-time Updates**: WebSocket support for live attendee count
2. **Analytics Dashboard**: Charts/graphs for attendance over time
3. **Mobile App**: Native mobile app for faster scanning
4. **NFC Support**: Alternative to QR codes
5. **Automated Reminders**: Send notifications to members before meetings
6. **Integration with Calendar**: Sync meetings with external calendars
7. **Multi-moderator Support**: Multiple scanners at different entrances
8. **Offline Mode**: Support offline scanning with sync when online

---

## 14. Testing Strategy

### Unit Tests
- **Redirect validation** (see test cases in section 8.3):
  - Same-origin pathnames allowed
  - Different origins blocked
  - Protocol-relative URLs blocked
  - JavaScript/data URLs blocked
- QR token generation/verification
- Share token generation/verification
- CSV export formatting
- Attendance calculation logic

### Integration Tests
- Meeting state transitions
- Attendance recording
- CSV export with real data
- Share link access control
- Share link regeneration
- **Redirect flow through auth**:
  - Redirect preserved from sign-in → email verification → success
  - Invalid redirects fall back to default

### E2E Tests (Playwright)
1. **Test redirect flow**: Visit protected page → sign-in → redirected back to protected page
2. User views their QR code
3. Admin creates meeting
4. Admin generates share link
5. **Test shared view redirect**: Non-admin clicks share link → sign-in → redirected to shared view
6. Admin starts meeting
7. Admin scans user QR code (mock camera)
8. Verify attendance recorded
9. Non-admin user accesses shared view via link (already authenticated)
10. Verify shared view is read-only
11. Admin exports CSV
12. Verify CSV contents
13. Admin regenerates share link
14. Verify old link no longer works
15. **Test open redirect prevention**: Try malicious redirect params (https://evil.com, //evil.com, javascript:alert(1))

---

## Notes

### General
- All timestamps should use `withTimezone: true` for international support
- CSV export should handle large meetings (1000+ attendees)
- Meeting events (start, recess, finish) should be clearly visible in CSV
- Manual check-in/out should require confirmation to prevent accidents

### Member QR Code
- **General purpose tool**: Not branded as "attendance" for users - just "member verification/card"
- Can be used for: meeting check-in, event access, member discounts, verification, etc.
- Only shown if user has active or expired membership
- QR code should be large enough to scan easily (200-300px recommended)
- Static tokens recommended (with human confirmation as security layer)
- Consider adding admin ability to regenerate user's QR token if compromised

### Scanner & Scanning
- Scanner should provide audio/haptic feedback for better UX
- Always show user name after scan for human verification
- Show context (e.g., "Scanning for: General Assembly 2026")
- Consider rate limiting on QR scans (max 1 scan per user per 5 seconds per meeting)

### Recess Handling
- **Short recess** (15 min): Keep current state, continue scanning in/out for accurate count
- **Long recess** (overnight/multi-day): Admin uses "Check Out All", then re-scan when resumed
- Admin chooses approach when starting recess based on duration

### Shared Links
- Share links require authentication for audit purposes (know who viewed the data)
- Share links should be regenerated if compromised or when secretary/chair changes
- Consider adding expiration dates to share links for additional security (optional enhancement)
