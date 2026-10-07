import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { subscribeMeetingChanges } from "$lib/server/attendance/live";
import { userHasAdminAccess } from "$lib/server/auth/admin";

// Proxies such as Azure's front end close responses that stay idle for a few minutes
const PING_INTERVAL_MS = 25_000;

/** Server-sent events telling an open meeting page to reload; carries no attendance data itself. */
export const GET: RequestHandler = async (event) => {
  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) error(404, "Not found");
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const subscription = subscribeMeetingChanges(event.params.id, () => send("event: changed\ndata:\n\n"));
      const ping = setInterval(() => send(": ping\n\n"), PING_INTERVAL_MS);
      cleanup = () => {
        clearInterval(ping);
        subscription.unsubscribe();
      };
      event.request.signal.addEventListener("abort", () => cleanup(), { once: true });
      try {
        await subscription.ready;
      } catch {
        cleanup();
        controller.error(new Error("Live updates unavailable"));
        return;
      }
      send("retry: 3000\n\n");
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
};
