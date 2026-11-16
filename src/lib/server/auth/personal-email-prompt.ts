import type { RequestEvent } from "@sveltejs/kit";
import { dev } from "$app/env";
import { env } from "#lib/server/env.js";

// "Later" on the personal email prompt hides it for a while, not for good
const dismissedCookieName = "personal_email_prompt_dismissed";
const dismissedFor = 60 * 60 * 24 * 30;

export function isPersonalEmailPromptDismissed(event: RequestEvent, userId: string): boolean {
  return event.cookies.get(dismissedCookieName) === userId;
}

export function dismissPersonalEmailPromptFor(event: RequestEvent, userId: string): void {
  event.cookies.set(dismissedCookieName, userId, {
    maxAge: dismissedFor,
    path: "/",
    httpOnly: true,
    secure: !dev && !env.TEST,
    sameSite: "lax",
  });
}
