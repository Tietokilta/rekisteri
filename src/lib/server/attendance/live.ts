import { sql } from "drizzle-orm";
import { db } from "$lib/server/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CHANNEL = "meeting_changed";

/** Postgres delivers the notification only when the transaction commits, so rolled-back changes stay silent. */
export async function notifyMeetingChanged(tx: Tx, meetingId: string) {
  await tx.execute(sql`select pg_notify(${CHANNEL}, ${meetingId})`);
}

const subscribers = new Map<string, Set<() => void>>();
let listening: Promise<unknown> | null = null;

async function listen() {
  try {
    return await db.$client.listen(
      CHANNEL,
      (id) => {
        for (const callback of subscribers.get(id) ?? []) callback();
      },
      () => {
        // Postgres reconnects independently of the SSE streams. Catch up on
        // notifications missed while this shared LISTEN connection was down.
        for (const callbacks of subscribers.values()) for (const callback of callbacks) callback();
      },
    );
  } catch (cause) {
    // Let the next subscriber try again
    listening = null;
    throw cause;
  }
}

/** One LISTEN connection per server instance, shared by every open meeting page. */
export function subscribeMeetingChanges(meetingId: string, onChange: () => void) {
  listening ??= listen();
  const callbacks = subscribers.get(meetingId) ?? new Set();
  callbacks.add(onChange);
  subscribers.set(meetingId, callbacks);
  return {
    ready: listening,
    unsubscribe() {
      callbacks.delete(onChange);
      if (callbacks.size === 0) subscribers.delete(meetingId);
    },
  };
}
