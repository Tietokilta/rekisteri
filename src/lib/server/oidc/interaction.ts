/**
 * SvelteKit-side equivalents of oidc-provider's `interactionDetails()` and `interactionFinished()`.
 *
 * Those two take Node req/res, which SvelteKit doesn't expose. They only read the interaction
 * cookie, load the Interaction model, and save the result, so we do the same against the
 * provider's models directly.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { redirect, type Cookies } from "@sveltejs/kit";
import type { InteractionResults } from "oidc-provider";
import type { getOidcProvider } from "./provider";

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

/** Stores the login/consent result and sends the browser back to the provider to resume. */
export async function finishInteraction(interaction: Interaction, result: InteractionResults): Promise<never> {
  interaction.result = "error" in result ? result : { ...interaction.lastSubmission, ...result };
  await interaction.save(interaction.exp - Math.floor(Date.now() / 1000));
  redirect(303, interaction.returnTo);
}
