export type QueuedScan = { eventId: string; token: string; direction: "in" | "out" };

const RETRY_MS = 5000;

/** No response at all, or a gateway error while the server restarts: worth sending again. */
export function isTransientError(cause: unknown) {
  const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined;
  return typeof status !== "number" || (status >= 502 && status <= 504);
}

/**
 * Scans that couldn't reach the server, resent in order with their original event IDs,
 * so a scan that did land the first time is still recorded only once.
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

  add(scan: QueuedScan) {
    this.pending.push(scan);
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
      }
    } finally {
      this.#flushing = false;
    }
  }

  dispose() {
    clearTimeout(this.#timer);
  }

  #retryLater() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), RETRY_MS);
  }
}
