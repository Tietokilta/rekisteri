import type { RequestEvent } from "@sveltejs/kit";
import * as v from "valibot";
import { dev } from "$app/env";
import { env } from "#lib/server/env.js";

// Tells the user, once, which account they switched to and what happened to the one they left
const accountSwitchCookieName = "account_switch";

const noticeSchema = v.object({
  // The address the user verified, which belongs to the account they are now signed in to
  accountEmail: v.string(),
  previousEmail: v.string(),
  // Whether the previous account was deleted and its address added to this one
  moved: v.boolean(),
});

export type AccountSwitchNotice = v.InferOutput<typeof noticeSchema>;

export function setAccountSwitchNotice(event: RequestEvent, notice: AccountSwitchNotice): void {
  event.cookies.set(accountSwitchCookieName, JSON.stringify(notice), {
    maxAge: 60 * 5,
    path: "/",
    httpOnly: true,
    secure: !dev && !env.TEST,
    sameSite: "lax",
  });
}

export function takeAccountSwitchNotice(event: RequestEvent): AccountSwitchNotice | null {
  const value = event.cookies.get(accountSwitchCookieName);
  if (!value) return null;
  event.cookies.delete(accountSwitchCookieName, { path: "/" });
  try {
    const result = v.safeParse(noticeSchema, JSON.parse(value));
    return result.success ? result.output : null;
  } catch {
    return null;
  }
}
