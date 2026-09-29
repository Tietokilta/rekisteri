export type AttendeeRow = {
  id: string;
  userId: string | null;
  displayName: string;
  isGuest: boolean;
  typeId: string | null;
  status: "present" | "pending" | "away";
  physicalPresent: boolean;
  lastActionAt: Date | null;
  conflicts: number;
};

export type RecordTarget = { attendeeId: string } | { userId: string } | { guestName: string };

export type CorrectionTarget = { kind: "edit"; eventId: string } | { kind: "add"; attendeeId?: string };

export function remoteErrorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "body" in cause) {
    const body = (cause as { body?: { message?: string } }).body;
    if (body?.message) return body.message;
  }
  if (cause && typeof cause === "object" && "message" in cause) return String((cause as { message: unknown }).message);
  return fallback;
}
