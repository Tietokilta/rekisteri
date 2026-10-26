/**
 * SvelteKit-side equivalents of oidc-provider's `interactionDetails()` and `interactionFinished()`.
 *
 * Those two take Node req/res, which SvelteKit doesn't expose. They only read the interaction
 * cookie, load the Interaction model, and save the result, so we do the same against the
 * provider's models directly.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { error, redirect, type Cookies } from "@sveltejs/kit";
import type { InteractionResults } from "oidc-provider";
import { env } from "$lib/server/env";
import { getCookieKeys, getOidcProvider } from "./provider";

type Interaction = InstanceType<ReturnType<typeof getOidcProvider>["Interaction"]>;

/**
 * Reads a cookie signed by oidc-provider (Koa's cookies: a `<name>.sig` companion holding the
 * HMAC-SHA1 of `<name>=<value>` with one of the keys). Returns undefined if the signature is off.
 */
export function readSignedCookie(cookies: Pick<Cookies, "get">, name: string, keys: string[]): string | undefined {
  const value = cookies.get(name);
  if (!value) return undefined;
  const signature = Buffer.from(cookies.get(`${name}.sig`) ?? "");
  const valid = keys.some((key) => {
    const expected = Buffer.from(createHmac("sha1", key).update(`${name}=${value}`).digest("base64url"));
    return expected.length === signature.length && timingSafeEqual(expected, signature);
  });
  return valid ? value : undefined;
}

/**
 * Loads the interaction for `uid`, or returns null if it's missing, expired, or not bound to
 * this browser (the signed `_interaction` cookie set by the provider must match).
 */
export async function getInteraction(cookies: Cookies, uid: string): Promise<Interaction | null> {
  if (!env.OIDC_ENABLED) error(404);

  const provider = getOidcProvider();
  if (readSignedCookie(cookies, provider.cookieName("interaction"), getCookieKeys()) !== uid) return null;

  const interaction = await provider.Interaction.find(uid);
  if (!interaction) return null;

  // Same check as oidc-provider: the provider session must not have changed hands meanwhile
  if (interaction.session?.uid) {
    const session = await provider.Session.findByUid(interaction.session.uid);
    if (!session || session.accountId !== interaction.session.accountId) return null;
  }

  return interaction;
}

/** Stores the login/consent result and sends the browser back to the provider to resume. */
export async function finishInteraction(interaction: Interaction, result: InteractionResults): Promise<never> {
  interaction.result = "error" in result ? result : { ...interaction.lastSubmission, ...result };
  await interaction.save(interaction.exp - Math.floor(Date.now() / 1000));
  redirect(303, interaction.returnTo);
}
