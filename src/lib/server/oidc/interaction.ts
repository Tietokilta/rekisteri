/**
 * SvelteKit-side equivalents of oidc-provider's `interactionDetails()` and `interactionFinished()`.
 *
 * Those two take Node req/res, which SvelteKit doesn't expose. They only read the interaction
 * cookie, load the Interaction model, and save the result, so we do the same against the
 * provider's models directly.
 */

import { error, redirect, type Cookies } from "@sveltejs/kit";
import type { InteractionResults } from "oidc-provider";
import { env } from "$lib/server/env";
import { getOidcProvider } from "./provider";

type Interaction = InstanceType<ReturnType<typeof getOidcProvider>["Interaction"]>;

/**
 * Loads the interaction for `uid`, or returns null if it's missing, expired, or not bound to
 * this browser (the `_interaction` cookie set by the provider must match).
 */
export async function getInteraction(cookies: Cookies, uid: string): Promise<Interaction | null> {
  if (!env.OIDC_ENABLED) error(404);

  const provider = getOidcProvider();
  if (cookies.get(provider.cookieName("interaction")) !== uid) return null;

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
