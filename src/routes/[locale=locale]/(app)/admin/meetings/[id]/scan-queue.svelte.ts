export type QueuedScan = { meetingId: string; eventId: string; token: string; direction: "in" | "out" };

const RETRY_MS = 5000;
const SEND_TIMEOUT_MS = 8000;

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
export class ScanQueue<T> {
  pending = $state<QueuedScan[]>([]);
  #flushing = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #send: (scan: QueuedScan) => Promise<T>;
  #onFailed: (scan: QueuedScan, cause: unknown) => void;
  #storageKey: string;
  #disposed = false;
  #storageFailed = false;

  constructor(
    send: (scan: QueuedScan) => Promise<T>,
    onFailed: (scan: QueuedScan, cause: unknown) => void,
    ownerId: string,
  ) {
    this.#send = send;
    this.#onFailed = onFailed;
    this.#storageKey = `meeting-scan-queue:${ownerId}`;
  }

  /** Loads scans left over from an earlier visit and starts sending them. Call in the browser only. */
  restore() {
    this.pending = this.#read();
    if (this.pending.length > 0) void this.flush();
  }

  async acknowledge(eventId: string) {
    await this.#update((stored) => stored.filter((item) => item.eventId !== eventId));
  }

  retry() {
    this.#retryLater();
  }

  async send(scan: QueuedScan): Promise<T | null> {
    // Serialize sends too: a rejected duplicate must not be resent after a
    // later scan has changed attendance and made that old direction valid.
    return navigator.locks.request(`${this.#storageKey}:send`, async () => {
      if (this.#disposed || this.#read().every((item) => item.eventId !== scan.eventId)) return null;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          this.#send(scan),
          new Promise<never>(
            (_, reject) => (timeout = setTimeout(() => reject(new Error("Timed out")), SEND_TIMEOUT_MS)),
          ),
        ]);
        await this.acknowledge(scan.eventId);
        return result;
      } catch (cause) {
        const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined;
        if (!isTransientError(cause) && status !== 401 && status !== 403 && status !== 404) {
          await this.acknowledge(scan.eventId);
        }
        throw cause;
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  #read() {
    if (this.#storageFailed) return this.pending;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(this.#storageKey) ?? "[]");
      if (Array.isArray(stored)) return stored.filter(isQueuedScan);
    } catch {
      // When storage is unavailable, retain this page's in-memory queue.
      this.#storageFailed = true;
    }
    return this.pending;
  }

  async add(scan: QueuedScan, retry = true) {
    let wasEmpty = false;
    await this.#update((stored) => {
      wasEmpty = stored.length === 0;
      return [...stored.filter((item) => item.eventId !== scan.eventId), scan];
    }, true);
    if (retry) this.#retryLater();
    return wasEmpty;
  }

  async flush() {
    if (this.#flushing || this.#disposed) return;
    this.#flushing = true;
    clearTimeout(this.#timer);
    try {
      while (!this.#disposed) {
        this.pending = this.#read();
        const scan = this.pending[0];
        if (!scan) break;
        try {
          await this.send(scan);
        } catch (cause) {
          if (this.#disposed) return;
          const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined;
          // Authorization may have changed while this page was open. Keep unsent
          // scans for their original operator instead of treating them as rejected.
          if (status === 401 || status === 403 || status === 404 || isTransientError(cause)) {
            this.#retryLater();
            return;
          }
          this.#onFailed(scan, cause);
        }
      }
    } finally {
      this.#flushing = false;
    }
  }

  dispose() {
    this.#disposed = true;
    clearTimeout(this.#timer);
  }

  async #update(change: (stored: QueuedScan[]) => QueuedScan[], preserveAfterNavigation = false) {
    // Other tabs can run concurrently, so serialize their read/modify/write
    // operations as well as merging the latest stored queue.
    await navigator.locks.request(this.#storageKey, () => {
      if (this.#disposed && !preserveAfterNavigation) return;
      this.pending = change(this.#read());
      // A private fallback snapshot must never overwrite another tab's
      // durable queue if storage becomes writable again later.
      if (this.#storageFailed) return;
      try {
        if (this.pending.length > 0) localStorage.setItem(this.#storageKey, JSON.stringify(this.pending));
        else localStorage.removeItem(this.#storageKey);
      } catch {
        // Without storage the queue still works for as long as the page stays open
        this.#storageFailed = true;
      }
    });
  }

  #retryLater() {
    if (this.#disposed) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), RETRY_MS);
  }
}
