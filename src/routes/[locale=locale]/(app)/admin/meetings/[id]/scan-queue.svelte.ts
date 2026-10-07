export type QueuedScan = { meetingId: string; eventId: string; token: string; direction: "in" | "out" };

const RETRY_MS = 5000;
const STORAGE_KEY = "meeting-scan-queue";

function isQueuedScan(value: unknown): value is QueuedScan {
  if (!value || typeof value !== "object") return false;
  const scan = value as Record<string, unknown>;
  return (
    typeof scan.meetingId === "string" &&
    typeof scan.eventId === "string" &&
    typeof scan.token === "string" &&
    (scan.direction === "in" || scan.direction === "out")
  );
}

/** No response at all, or a gateway error while the server restarts: worth sending again. */
export function isTransientError(cause: unknown) {
  const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined;
  return typeof status !== "number" || (status >= 502 && status <= 504);
}

/**
 * Scans that couldn't reach the server, resent in order with their original event IDs,
 * so a scan that did land the first time is still recorded only once.
 * Kept in this browser's storage until sent, so a reload or a closed tab doesn't lose them.
 */
export class ScanQueue {
  pending = $state<QueuedScan[]>([]);
  #flushing = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #send: (scan: QueuedScan) => Promise<unknown>;
  #onFailed: (scan: QueuedScan, cause: unknown) => void;

  constructor(send: (scan: QueuedScan) => Promise<unknown>, onFailed: (scan: QueuedScan, cause: unknown) => void) {
    this.#send = send;
    this.#onFailed = onFailed;
  }

  /** Loads scans left over from an earlier visit and starts sending them. Call in the browser only. */
  restore() {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(stored)) this.pending = stored.filter(isQueuedScan);
    } catch {
      // Storage blocked or corrupted: start with an empty queue
    }
    if (this.pending.length > 0) void this.flush();
  }

  add(scan: QueuedScan) {
    this.pending.push(scan);
    this.#save();
    this.#retryLater();
  }

  async flush() {
    if (this.#flushing) return;
    this.#flushing = true;
    clearTimeout(this.#timer);
    try {
      while (this.pending[0]) {
        const scan = this.pending[0];
        try {
          await this.#send(scan);
        } catch (cause) {
          if (isTransientError(cause)) {
            this.#retryLater();
            return;
          }
          this.#onFailed(scan, cause);
        }
        this.pending.shift();
        this.#save();
      }
    } finally {
      this.#flushing = false;
    }
  }

  dispose() {
    clearTimeout(this.#timer);
  }

  #save() {
    try {
      if (this.pending.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.pending));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Without storage the queue still works for as long as the page stays open
    }
  }

  #retryLater() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), RETRY_MS);
  }
}
