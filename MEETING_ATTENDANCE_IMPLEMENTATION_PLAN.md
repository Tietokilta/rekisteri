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

### 2.5 Scan API Endpoint with Double-Scan Prevention

**File**: `src/routes/api/attendance/scan/+server.ts`

**Purpose**: Handle QR code scans with state validation to prevent accidental double-scans

**Implementation**:
```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyQrToken } from '$lib/server/attendance/qr-token';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
  // Require admin authentication
  if (!locals.user?.isAdmin) {
    throw error(403, 'Forbidden');
  }

  const { token, meetingId } = await request.json();

  // Verify QR token and get user
  const userId = await verifyQrToken(token);
  if (!userId) {
    throw error(400, 'Invalid QR code');
  }

  // Get user details
  const user = await db.query.user.findFirst({
    where: eq(table.user.id, userId),
  });

  if (!user) {
    throw error(400, 'User not found');
  }

  // CRITICAL: Get user's last attendance event for this meeting
  const lastEvent = await db.query.attendance.findFirst({
    where: and(
      eq(table.attendance.meetingId, meetingId),
      eq(table.attendance.userId, userId)
    ),
    orderBy: [desc(table.attendance.timestamp)],
  });

  // Determine next event type based on last event
  let nextEventType: 'CHECK_IN' | 'CHECK_OUT';

  if (!lastEvent || lastEvent.eventType === 'CHECK_OUT') {
    // User is currently OUT → next must be CHECK_IN
    nextEventType = 'CHECK_IN';
  } else if (lastEvent.eventType === 'CHECK_IN') {
    // User is currently IN → next must be CHECK_OUT
    nextEventType = 'CHECK_OUT';
  } else {
    // Unexpected state
    throw error(500, 'Invalid attendance state');
  }

  // Record attendance event
  await db.insert(table.attendance).values({
    id: crypto.randomUUID(),
    meetingId,
    userId,
    eventType: nextEventType,
    scanMethod: 'qr_scan',
    scannedBy: locals.user.id,
    timestamp: new Date(),
  });

  // Return success with user info and action taken
  return json({
    success: true,
    action: nextEventType,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      // Add membership type from member table if needed
    },
  });
};
```

**Key Features**:
- **State Validation**: Queries user's last attendance event before inserting new one
- **Prevents Double-Scans**: If user is already checked in, next scan must be check out
- **Clear Error Messages**: Returns specific error if scan violates state
- **Audit Trail**: Records who performed the scan (`scannedBy`)
- **Response Data**: Returns action taken + user info for confirmation UI

**Frontend Integration**:
```typescript
// In scanner component, after QR code decoded:
async function handleScan(token: string) {
  try {
    const response = await fetch('/api/attendance/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, meetingId }),
    });

    if (!response.ok) {
      const error = await response.json();
      // Show error to admin (e.g., "User is already checked in")
      showError(error.message);
      playErrorSound();
      return;
    }

    const result = await response.json();
    // Show confirmation modal with user name and action
    showConfirmation(result.user, result.action);
    playSuccessSound();
  } catch (err) {
    // Network error - CRITICAL for single door
    showError('Network Error - Please Try Again');
    playErrorSound();
    vibrateDevice(); // Immediate haptic feedback
  }
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
      - ⚠️ **Warning displayed in UI**: "Attendee count will only remain accurate if the door remains manned during recess"
      - If admin also takes a break, count will drift
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
- **Wake Lock API**: Keep screen on (prevent auto-dimming) while modal is open
- **High Contrast Mode**: Force black QR on pure white background (override dark mode)
- **Manual Brightness Instruction**: Clear UI prompt: "Please maximize your screen brightness for best scanning"
- **Consistent position**: QR code always centered on screen, no scrolling needed
- QR code display: Large and clear (250-300px) for easy scanning
- User's full name displayed prominently
- Generic title: "Member Verification" or "Member Card"
- Instructions: "Show this for member verification" (not attendance-specific)
- Close button (X) and backdrop click to dismiss
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

  async function openQRCode() {
    dialog.showModal();

    // Request wake lock to keep screen on (prevent auto-dimming)
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.error('Wake Lock error:', err);
      }
    }
  }

  function closeQRCode() {
    // Release wake lock
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }

    dialog.close();
  }
</script>

<button onclick={openQRCode}>Show Member Card</button>

<dialog bind:this={dialog} class="full-screen-qr-modal">
  <div class="modal-content">
    <button onclick={closeQRCode} class="close-button">×</button>

    <!-- Brightness instruction -->
    <div class="brightness-notice">
      ⚠️ Please maximize your screen brightness for best scanning
    </div>

    <h2>Member Card</h2>

    <!-- QR code container with forced high contrast -->
    <div class="qr-code-container">
      <!-- QR code rendered here (black on white, always) -->
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
    /* Force white background, override dark mode */
    background: #ffffff;
    color: #000000;
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

  .brightness-notice {
    background: #fff3cd;
    border: 2px solid #ffc107;
    color: #000;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
    font-weight: 500;
  }

  .qr-code-container {
    /* Ensure pure white background for QR code */
    background: #ffffff;
    padding: 1rem;
    border-radius: 0.5rem;
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

/**
 * Calculate total duration by summing segments (check-in to check-out pairs).
 *
 * IMPORTANT: Do NOT use simple subtraction (finalCheckOut - firstCheckIn).
 * Users may leave and return during recess, creating multiple segments:
 *
 * Example: User arrives at 14:00, leaves at 15:30 for recess, returns at 16:00, leaves at 18:00
 * - Segment 1: 15:30 - 14:00 = 90 minutes
 * - Segment 2: 18:00 - 16:00 = 120 minutes
 * - Total: 210 minutes (NOT 18:00 - 14:00 = 240 minutes)
 */
function calculateUserDuration(userAttendance: Attendance[]): number {
  // Sort by timestamp
  const sorted = userAttendance.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let totalMinutes = 0;
  let currentCheckIn: Date | null = null;

  for (const event of sorted) {
    if (event.eventType === 'CHECK_IN') {
      currentCheckIn = new Date(event.timestamp);
    } else if (event.eventType === 'CHECK_OUT' && currentCheckIn) {
      const checkOut = new Date(event.timestamp);
      const segmentMinutes = (checkOut.getTime() - currentCheckIn.getTime()) / (1000 * 60);
      totalMinutes += segmentMinutes;
      currentCheckIn = null;
    }
  }

  return Math.round(totalMinutes);
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

5. **Double-Scan Prevention** (Single Admin/Single Door):
   - Backend endpoint (`api/attendance/scan`) MUST check user's last attendance event
   - State validation:
     - If last event was CHECK_IN → Next must be CHECK_OUT (or prompt for confirmation)
     - If last event was CHECK_OUT → Next must be CHECK_IN
   - Prevents accidental double-scans from nervous hand or network lag
   - Return clear error message if scan violates state (e.g., "User is already checked in")
   - Admin UI should show current state before scan (visual indicator: "In" or "Out")

6. **Network Feedback** (Critical for Single Door):
   - Online-first validation (server-side check) - no offline mode
   - Immediate audio/haptic feedback for network errors
   - Visual loading state during scan processing
   - If network fails, entire line stops → feedback must be instant
   - Consider retry logic with exponential backoff for transient network errors
   - Clear error messages: "Network Error - Please Try Again"

7. **Audit Logging**:
   - Log all meeting state changes (use existing `auditLog` table)
   - Log all attendance events
   - Track who performed each action
   - Log share link generation/regeneration
   - Optionally log access to shared views

8. **Sign-In Redirect Security** (Important for Shared Views):
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

### Phase 1: Database & Core Logic + Test Helpers
1. Add enums to `src/lib/shared/enums.ts`
2. Add database schema to `src/lib/server/db/schema.ts`
3. Create migration and run it
4. Create QR token utilities (`src/lib/server/attendance/qr-token.ts`)
5. Create attendance logic utilities (`src/lib/server/attendance/index.ts`)
6. **Create test helpers** (`e2e/fixtures/attendance.ts`):
   - `AttendanceTestHelper` class
   - Factory functions (`createTestMeeting`, `createTestUser`)
7. **Write unit tests** (`src/lib/server/attendance/index.test.ts`):
   - QR token generation/verification
   - Share token generation/verification
   - Meeting state transitions

**Estimated**: 3-4 hours

### Phase 2: Member QR Modal on Dashboard
1. Create member QR modal component (`src/lib/components/member-qr-modal.svelte`)
2. Update dashboard to load QR token (if user has membership)
3. Add trigger button to dashboard (alongside MembershipCard)
4. Add i18n translations (generic member verification, not attendance-specific)
5. Add conditional rendering (only show button if active/expired membership exists)
6. **Write e2e test**: User opens QR modal, sees brightness warning, closes modal

**Estimated**: 2-3 hours

### Phase 3: Admin Meeting Management
1. Add "Meetings" nav item to `src/lib/navigation.ts` (getAdminNavItems)
2. Create meetings list page
3. Create meeting creation form
4. Create meeting detail/control panel
5. Implement state transition actions
6. **Write e2e tests**:
   - Admin creates meeting
   - Admin starts meeting
   - Admin transitions to recess (test both short and long options)
   - Admin ends meeting

**Estimated**: 4-6 hours

### Phase 4: QR Scanner & Scan API
1. Create scan API endpoint (`src/routes/api/attendance/scan/+server.ts`) with double-scan prevention
2. Create scanner page
3. Implement QR scanner component
4. Implement scan confirmation UI
5. Add network error feedback (audio/haptic)
6. **Write unit tests**:
   - Double-scan prevention (check-in after check-in fails)
   - State validation (check-out requires prior check-in)
7. **Write integration tests** (`e2e/attendance-flows.test.ts`):
   - Simple check-in/out flow
   - User tries to check in twice (error)
   - User tries to check out without checking in (error)

**Estimated**: 5-7 hours

### Phase 5: Attendee Management
1. Create attendee list page
2. Implement manual check-in/out
3. Add filtering/searching
4. **Write integration tests**:
   - Short recess scenario (keep state, continue scanning)
   - Long recess scenario (check out all, re-scan on resume)
   - User leaves and returns multiple times
   - Concurrent arrivals

**Estimated**: 4-6 hours

### Phase 6: CSV Export
1. Implement CSV generation logic with segment duration calculation
2. Create export endpoint
3. **Write unit tests**:
   - Duration calculation with single segment
   - Duration calculation with multiple segments (recess scenario)
   - CSV formatting with all sections
4. **Write e2e test**:
   - Export CSV and verify content

**Estimated**: 3-4 hours

### Phase 7: Shared View Link
1. Create share token utilities
2. Add share link UI to admin control panel
3. Create shared view page
4. **Write e2e tests**:
   - Non-admin accesses shared view
   - Verify read-only (no edit buttons)
   - Admin regenerates share link
   - Old link no longer works

**Estimated**: 3-4 hours

### Phase 8: Polish & Full Test Suite
1. Add error handling throughout
2. Add loading states
3. Add success/error toasts
4. Add audit logging
5. **Complete test coverage**:
   - Run through test coverage checklist
   - Fix any failing tests
   - Add edge case tests as needed
6. **Manual testing**:
   - Test on real mobile devices
   - Test QR scanner in different lighting conditions
   - Test network failure scenarios

**Estimated**: 4-6 hours

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

#### Test Files
- [ ] `e2e/fixtures/attendance.ts` (test helpers: AttendanceTestHelper, factories)
- [ ] `src/lib/server/attendance/index.test.ts` (unit tests: double-scan prevention, duration calculation, state transitions)
- [ ] `e2e/attendance-flows.test.ts` (integration tests: door flows, recess scenarios)
- [ ] `e2e/attendance-ui.test.ts` (e2e tests: UI flows, CSV export, shared views)

---

## 12. Estimated Effort

- **Phase 0: Secure Redirect**: 2-3 hours (auth improvement, required for shared view)
- **Phase 1: Database & Core Logic + Test Helpers**: 3-4 hours
- **Phase 2: Member QR Modal**: 2-3 hours
- **Phase 3: Admin Meeting Management**: 4-6 hours
- **Phase 4: QR Scanner & Scan API**: 5-7 hours (includes double-scan prevention logic)
- **Phase 5: Attendee Management**: 4-6 hours (includes recess scenario tests)
- **Phase 6: CSV Export**: 3-4 hours (includes duration calculation tests)
- **Phase 7: Shared View Link**: 3-4 hours
- **Phase 8: Polish & Full Test Suite**: 4-6 hours

**Total**: 30-46 hours (includes comprehensive test coverage)

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

### 14.1 Test Helpers & Abstractions

**File**: `e2e/fixtures/attendance.ts`

Create helper functions to make attendance tests readable and maintainable:

```typescript
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';

/**
 * Test helper for simulating attendance flows without QR scanning
 */
export class AttendanceTestHelper {
  constructor(
    private meetingId: string,
    private adminUserId: string
  ) {}

  /**
   * Simulate a user checking in (bypasses QR scan)
   */
  async checkIn(userId: string, timestamp?: Date): Promise<void> {
    await db.insert(table.attendance).values({
      id: crypto.randomUUID(),
      meetingId: this.meetingId,
      userId,
      eventType: 'CHECK_IN',
      scanMethod: 'manual',
      scannedBy: this.adminUserId,
      timestamp: timestamp || new Date(),
    });
  }

  /**
   * Simulate a user checking out
   */
  async checkOut(userId: string, timestamp?: Date): Promise<void> {
    await db.insert(table.attendance).values({
      id: crypto.randomUUID(),
      meetingId: this.meetingId,
      userId,
      eventType: 'CHECK_OUT',
      scanMethod: 'manual',
      scannedBy: this.adminUserId,
      timestamp: timestamp || new Date(),
    });
  }

  /**
   * Simulate a complete visit (check-in + check-out)
   */
  async visit(userId: string, checkInTime: Date, checkOutTime: Date): Promise<void> {
    await this.checkIn(userId, checkInTime);
    await this.checkOut(userId, checkOutTime);
  }

  /**
   * Get current attendees (checked in but not out)
   */
  async getCurrentAttendees(): Promise<string[]> {
    const events = await db.query.attendance.findMany({
      where: eq(table.attendance.meetingId, this.meetingId),
      orderBy: [asc(table.attendance.timestamp)],
    });

    const currentlyIn = new Set<string>();

    for (const event of events) {
      if (event.eventType === 'CHECK_IN') {
        currentlyIn.add(event.userId);
      } else if (event.eventType === 'CHECK_OUT') {
        currentlyIn.delete(event.userId);
      }
    }

    return Array.from(currentlyIn);
  }

  /**
   * Transition meeting state
   */
  async transitionMeeting(
    status: 'upcoming' | 'ongoing' | 'recess' | 'finished',
    notes?: string
  ): Promise<void> {
    const eventTypeMap = {
      ongoing: 'START',
      recess: 'RECESS_START',
      finished: 'FINISH',
    };

    if (status !== 'upcoming') {
      await db.insert(table.meetingEvent).values({
        id: crypto.randomUUID(),
        meetingId: this.meetingId,
        eventType: eventTypeMap[status],
        notes,
        timestamp: new Date(),
      });
    }

    await db.update(table.meeting)
      .set({ status })
      .where(eq(table.meeting.id, this.meetingId));
  }

  /**
   * Check out all attendees (for long recess scenario)
   */
  async checkOutAll(): Promise<void> {
    const currentlyIn = await this.getCurrentAttendees();
    const now = new Date();

    for (const userId of currentlyIn) {
      await this.checkOut(userId, now);
    }
  }
}

/**
 * Factory for creating test meetings
 */
export async function createTestMeeting(name: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(table.meeting).values({
    id,
    name,
    description: `Test meeting: ${name}`,
    status: 'upcoming',
  });
  return id;
}

/**
 * Factory for creating test users with QR tokens
 */
export async function createTestUser(
  email: string,
  name: string,
  isAdmin = false
): Promise<User> {
  const id = crypto.randomUUID();
  const qrToken = generateQrToken();

  await db.insert(table.user).values({
    id,
    email,
    name,
    isAdmin,
    attendanceQrToken: qrToken,
  });

  return { id, email, name, isAdmin, attendanceQrToken: qrToken } as User;
}
```

### 14.2 Unit Tests (Vitest)

**File**: `src/lib/server/attendance/index.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AttendanceTestHelper, createTestMeeting, createTestUser } from 'e2e/fixtures/attendance';
import { calculateUserDuration } from '$lib/server/attendance/export';
import { db } from '$lib/server/db';

describe('Attendance Logic', () => {
  let helper: AttendanceTestHelper;
  let meetingId: string;
  let adminUser: User;
  let testUser: User;

  beforeEach(async () => {
    meetingId = await createTestMeeting('Test Meeting');
    adminUser = await createTestUser('admin@test.com', 'Admin', true);
    testUser = await createTestUser('user@test.com', 'Test User');
    helper = new AttendanceTestHelper(meetingId, adminUser.id);
  });

  describe('Double-Scan Prevention', () => {
    it('should prevent double check-in', async () => {
      await helper.checkIn(testUser.id);

      // Attempt second check-in should fail
      await expect(
        helper.checkIn(testUser.id)
      ).rejects.toThrow('User is already checked in');
    });

    it('should prevent double check-out', async () => {
      await helper.checkIn(testUser.id);
      await helper.checkOut(testUser.id);

      // Attempt second check-out should fail
      await expect(
        helper.checkOut(testUser.id)
      ).rejects.toThrow('User is already checked out');
    });

    it('should allow check-in after check-out', async () => {
      await helper.checkIn(testUser.id);
      await helper.checkOut(testUser.id);
      await helper.checkIn(testUser.id); // Should succeed

      const currentAttendees = await helper.getCurrentAttendees();
      expect(currentAttendees).toContain(testUser.id);
    });
  });

  describe('Duration Calculation', () => {
    it('should calculate simple visit duration', async () => {
      const checkIn = new Date('2026-01-17T14:00:00Z');
      const checkOut = new Date('2026-01-17T16:30:00Z');

      await helper.visit(testUser.id, checkIn, checkOut);

      const duration = await calculateUserDuration(testUser.id, meetingId);
      expect(duration).toBe(150); // 2.5 hours = 150 minutes
    });

    it('should sum multiple segments (recess scenario)', async () => {
      // Segment 1: 14:00 - 15:30 (90 min)
      await helper.visit(
        testUser.id,
        new Date('2026-01-17T14:00:00Z'),
        new Date('2026-01-17T15:30:00Z')
      );

      // Segment 2: 16:00 - 18:00 (120 min)
      await helper.visit(
        testUser.id,
        new Date('2026-01-17T16:00:00Z'),
        new Date('2026-01-17T18:00:00Z')
      );

      const duration = await calculateUserDuration(testUser.id, meetingId);
      expect(duration).toBe(210); // 90 + 120 = 210 minutes

      // NOT 240 (18:00 - 14:00)
      expect(duration).not.toBe(240);
    });

    it('should handle currently checked-in user (no check-out yet)', async () => {
      await helper.checkIn(testUser.id, new Date('2026-01-17T14:00:00Z'));

      const duration = await calculateUserDuration(testUser.id, meetingId);
      // Should return 0 or current duration up to now
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Meeting State Transitions', () => {
    it('should transition from upcoming to ongoing', async () => {
      await helper.transitionMeeting('ongoing');

      const meeting = await db.query.meeting.findFirst({
        where: eq(table.meeting.id, meetingId),
      });

      expect(meeting?.status).toBe('ongoing');
    });

    it('should record meeting events', async () => {
      await helper.transitionMeeting('ongoing');
      await helper.transitionMeeting('recess', 'Lunch break');

      const events = await db.query.meetingEvent.findMany({
        where: eq(table.meetingEvent.meetingId, meetingId),
      });

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('START');
      expect(events[1].eventType).toBe('RECESS_START');
      expect(events[1].notes).toBe('Lunch break');
    });
  });
});
```

### 14.3 Integration Tests - Door Flow Scenarios

**File**: `e2e/attendance-flows.test.ts`

```typescript
import { test, expect } from '@playwright/test';
import { AttendanceTestHelper, createTestMeeting, createTestUser } from './fixtures/attendance';
import { db } from '$lib/server/db';

test.describe('Attendance Door Flows', () => {
  let meetingId: string;
  let helper: AttendanceTestHelper;
  let admin: User;
  let users: User[];

  test.beforeEach(async () => {
    meetingId = await createTestMeeting('General Assembly 2026');
    admin = await createTestUser('admin@tietokilta.fi', 'Admin User', true);
    helper = new AttendanceTestHelper(meetingId, admin.id);

    // Create test users
    users = await Promise.all([
      createTestUser('alice@test.com', 'Alice'),
      createTestUser('bob@test.com', 'Bob'),
      createTestUser('charlie@test.com', 'Charlie'),
    ]);
  });

  test('Simple check-in/out flow', async () => {
    // Meeting starts
    await helper.transitionMeeting('ongoing');

    // Alice arrives
    await helper.checkIn(users[0].id);
    expect(await helper.getCurrentAttendees()).toHaveLength(1);

    // Bob arrives
    await helper.checkIn(users[1].id);
    expect(await helper.getCurrentAttendees()).toHaveLength(2);

    // Alice leaves
    await helper.checkOut(users[0].id);
    expect(await helper.getCurrentAttendees()).toHaveLength(1);

    // Bob leaves
    await helper.checkOut(users[1].id);
    expect(await helper.getCurrentAttendees()).toHaveLength(0);
  });

  test('Short recess - keep state, continue scanning', async () => {
    await helper.transitionMeeting('ongoing');

    // 3 users check in
    await helper.checkIn(users[0].id);
    await helper.checkIn(users[1].id);
    await helper.checkIn(users[2].id);
    expect(await helper.getCurrentAttendees()).toHaveLength(3);

    // Start short recess (keep state)
    await helper.transitionMeeting('recess', '15 min coffee break');

    // Alice leaves during recess (scan out at door)
    await helper.checkOut(users[0].id);
    expect(await helper.getCurrentAttendees()).toHaveLength(2);

    // Resume meeting
    await helper.transitionMeeting('ongoing');

    // Bob leaves after resume
    await helper.checkOut(users[1].id);
    expect(await helper.getCurrentAttendees()).toHaveLength(1);

    // Only Charlie remains
    const remaining = await helper.getCurrentAttendees();
    expect(remaining).toEqual([users[2].id]);
  });

  test('Long recess - clear all, re-scan on resume', async () => {
    await helper.transitionMeeting('ongoing');

    // 3 users check in
    await helper.checkIn(users[0].id);
    await helper.checkIn(users[1].id);
    await helper.checkIn(users[2].id);
    expect(await helper.getCurrentAttendees()).toHaveLength(3);

    // Start long recess (overnight)
    await helper.transitionMeeting('recess', 'Day 1 end');

    // Admin clicks "Check Out All"
    await helper.checkOutAll();
    expect(await helper.getCurrentAttendees()).toHaveLength(0);

    // Resume meeting (Day 2)
    await helper.transitionMeeting('ongoing', 'Day 2 start');

    // Only Alice and Bob return (Charlie doesn't come back)
    await helper.checkIn(users[0].id);
    await helper.checkIn(users[1].id);
    expect(await helper.getCurrentAttendees()).toHaveLength(2);
  });

  test('User leaves and returns multiple times', async () => {
    await helper.transitionMeeting('ongoing');

    const baseTime = new Date('2026-01-17T14:00:00Z');

    // Alice: 14:00 - 15:00 (60 min)
    await helper.visit(
      users[0].id,
      new Date(baseTime.getTime()),
      new Date(baseTime.getTime() + 60 * 60 * 1000)
    );

    // Alice: 15:30 - 16:30 (60 min)
    await helper.visit(
      users[0].id,
      new Date(baseTime.getTime() + 90 * 60 * 1000),
      new Date(baseTime.getTime() + 150 * 60 * 1000)
    );

    // Alice: 17:00 - 18:00 (60 min)
    await helper.visit(
      users[0].id,
      new Date(baseTime.getTime() + 180 * 60 * 1000),
      new Date(baseTime.getTime() + 240 * 60 * 1000)
    );

    // Total should be 180 minutes (3 x 60min segments)
    const duration = await calculateUserDuration(users[0].id, meetingId);
    expect(duration).toBe(180);
  });

  test('Concurrent arrivals (realistic door scenario)', async () => {
    await helper.transitionMeeting('ongoing');

    // All 3 users arrive within 1 minute (realistic door scenario)
    const arrivalTime = new Date('2026-01-17T14:00:00Z');

    await helper.checkIn(users[0].id, new Date(arrivalTime.getTime()));
    await helper.checkIn(users[1].id, new Date(arrivalTime.getTime() + 20 * 1000)); // 20s later
    await helper.checkIn(users[2].id, new Date(arrivalTime.getTime() + 40 * 1000)); // 40s later

    expect(await helper.getCurrentAttendees()).toHaveLength(3);
  });

  test('Edge case: user tries to leave without checking in', async () => {
    await helper.transitionMeeting('ongoing');

    // Alice tries to check out without checking in first
    await expect(
      helper.checkOut(users[0].id)
    ).rejects.toThrow('User is not checked in');
  });

  test('Edge case: meeting finishes while users are still checked in', async () => {
    await helper.transitionMeeting('ongoing');

    await helper.checkIn(users[0].id);
    await helper.checkIn(users[1].id);

    // Admin ends meeting (users forgot to check out)
    await helper.transitionMeeting('finished');

    // Should still have 2 attendees (they never checked out)
    expect(await helper.getCurrentAttendees()).toHaveLength(2);

    // CSV export should handle this gracefully (no check-out time)
  });
});
```

### 14.4 E2E Tests (Playwright UI)

**File**: `e2e/attendance-ui.test.ts`

```typescript
import { test, expect } from './fixtures/auth';

test.describe('Attendance UI Flows', () => {
  test('Admin creates and manages meeting', async ({ adminPage }) => {
    // Navigate to meetings page
    await adminPage.goto('/fi/admin/meetings');

    // Create new meeting
    await adminPage.getByRole('button', { name: 'Luo kokous' }).click();
    await adminPage.getByLabel('Nimi').fill('General Assembly 2026');
    await adminPage.getByLabel('Kuvaus').fill('Annual general assembly');
    await adminPage.getByRole('button', { name: 'Tallenna' }).click();

    // Verify meeting created
    await expect(adminPage.getByText('General Assembly 2026')).toBeVisible();

    // Start meeting
    await adminPage.getByRole('button', { name: 'Aloita kokous' }).click();
    await expect(adminPage.getByText('Käynnissä')).toBeVisible();

    // Start short recess
    await adminPage.getByRole('button', { name: 'Aloita tauko' }).click();
    await adminPage.getByLabel('Lyhyt tauko').check();
    await adminPage.getByLabel('Huomautukset').fill('Coffee break');
    await adminPage.getByRole('button', { name: 'Tallenna' }).click();

    // Verify warning is shown
    await expect(
      adminPage.getByText('Osallistujamäärä pysyy tarkkana vain jos ovi on miehitetty')
    ).toBeVisible();

    // Resume meeting
    await adminPage.getByRole('button', { name: 'Jatka kokousta' }).click();

    // End meeting
    await adminPage.getByRole('button', { name: 'Lopeta kokous' }).click();
    await expect(adminPage.getByText('Päättynyt')).toBeVisible();
  });

  test('Admin manually checks user in/out', async ({ adminPage }) => {
    // Pre-create meeting and user via test helpers
    const meetingId = await createTestMeeting('Test Meeting');
    const user = await createTestUser('test@test.com', 'Test User');

    // Navigate to attendees page
    await adminPage.goto(`/fi/admin/meetings/${meetingId}/attendees`);

    // Find user in list
    const userRow = adminPage.getByRole('row', { name: /Test User/ });

    // Manual check-in
    await userRow.getByRole('button', { name: 'Kirjaa sisään' }).click();
    await expect(userRow.getByText('Sisällä')).toBeVisible();

    // Manual check-out
    await userRow.getByRole('button', { name: 'Kirjaa ulos' }).click();
    await expect(userRow.getByText('Ulkona')).toBeVisible();
  });

  test('CSV export contains correct data', async ({ adminPage }) => {
    // Setup test scenario with known data
    const meetingId = await createTestMeeting('Test Meeting');
    const helper = new AttendanceTestHelper(meetingId, adminUser.id);
    const user = await createTestUser('alice@test.com', 'Alice');

    await helper.transitionMeeting('ongoing');
    await helper.visit(
      user.id,
      new Date('2026-01-17T14:00:00Z'),
      new Date('2026-01-17T16:30:00Z')
    );
    await helper.transitionMeeting('finished');

    // Download CSV
    await adminPage.goto(`/fi/admin/meetings/${meetingId}`);
    const downloadPromise = adminPage.waitForEvent('download');
    await adminPage.getByRole('button', { name: 'Vie CSV' }).click();
    const download = await downloadPromise;

    // Read CSV content
    const csvContent = await download.path();
    const content = await fs.readFile(csvContent, 'utf-8');

    // Verify data
    expect(content).toContain('Test Meeting');
    expect(content).toContain('Alice');
    expect(content).toContain('alice@test.com');
    expect(content).toContain('150'); // 2.5 hours = 150 minutes
  });

  test('User views their QR code in modal', async ({ authenticatedPage }) => {
    // User with membership
    await authenticatedPage.goto('/fi');

    // Click "Show Member Card" button
    await authenticatedPage.getByRole('button', { name: 'Näytä jäsenkortti' }).click();

    // Verify modal opened
    const modal = authenticatedPage.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Verify brightness warning
    await expect(
      modal.getByText('Aseta näytön kirkkaus maksimiin')
    ).toBeVisible();

    // Verify QR code is visible
    const qrCode = modal.locator('canvas, img').first();
    await expect(qrCode).toBeVisible();

    // Close modal
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
  });

  test('Non-admin accesses shared view', async ({ authenticatedPage }) => {
    // Pre-create meeting with share token
    const meetingId = await createTestMeeting('Shared Meeting');
    const shareToken = await ensureMeetingHasShareToken(meetingId);

    // Navigate to shared view
    await authenticatedPage.goto(`/fi/meetings/shared/${shareToken}`);

    // Verify read-only banner
    await expect(
      authenticatedPage.getByText('Vain luku -näkymä')
    ).toBeVisible();

    // Verify can see meeting data
    await expect(authenticatedPage.getByText('Shared Meeting')).toBeVisible();

    // Verify no edit buttons
    await expect(
      authenticatedPage.getByRole('button', { name: 'Kirjaa sisään' })
    ).not.toBeVisible();
  });
});
```

### 14.5 Test Coverage Checklist

**Core Logic**:
- [ ] QR token generation/verification
- [ ] Share token generation/verification  - [ ] Double-scan prevention (check-in after check-in fails)
- [ ] State validation (check-out requires prior check-in)
- [ ] Duration calculation with single segment
- [ ] Duration calculation with multiple segments (recess scenario)
- [ ] Meeting state transitions (upcoming → ongoing → recess → ongoing → finished)

**Door Flow Scenarios**:
- [ ] Simple check-in/check-out
- [ ] Multiple users arriving concurrently
- [ ] User leaves and returns (multiple segments)
- [ ] Short recess - keep state, continue scanning
- [ ] Long recess - check out all, re-scan on resume
- [ ] User tries to leave without checking in (error)
- [ ] User tries to check in twice (error)
- [ ] Meeting finishes with users still checked in

**CSV Export**:
- [ ] Header section with meeting info
- [ ] Meeting events section (start, recess, finish)
- [ ] Attendance records with all columns
- [ ] Summary section with counts
- [ ] Duration calculated correctly for multi-segment visits
- [ ] Large meetings (1000+ attendees) export successfully

**Security & Access Control**:
- [ ] Only admins can access meeting control panel
- [ ] Only admins can scan QR codes
- [ ] Non-admin authenticated users can access shared views
- [ ] Unauthenticated users redirected to sign-in for shared views
- [ ] Share link regeneration invalidates old link
- [ ] Redirect validation (same-origin only)

**UI/UX**:
- [ ] QR code modal opens and closes
- [ ] Brightness warning displayed in modal
- [ ] High contrast mode (black QR on white)
- [ ] Scanner shows confirmation after scan
- [ ] Network error feedback (audio/haptic)
- [ ] Recess warning ("door must remain manned") displayed
- [ ] Manual check-in/out requires confirmation

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
