import { redirect } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { db } from "$lib/server/db";
import { oidcClient, oidcConsent } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { getOidcProvider } from "$lib/server/oidc/provider";
import { getLL } from "$lib/server/i18n";
import { finishInteraction, getInteraction } from "$lib/server/oidc/interaction";
import { invalidateSession, deleteSessionTokenCookie } from "$lib/server/auth/session";
import { auditFromEvent, createAuditLog } from "$lib/server/audit";
import { canUseClient } from "$lib/server/oidc/access";

// Grant only what this request asked for, limited to the scopes the client is allowed
function grantedScopes(requested: unknown, clientScopes: string[]): string[] {
  const allowed = new Set(["openid", ...clientScopes]);
  const requestedScopes = typeof requested === "string" ? requested.split(" ") : [];
  return requestedScopes.filter((scope) => allowed.has(scope));
}

type Interaction = NonNullable<Awaited<ReturnType<typeof getInteraction>>>;

// Login prompt reasons this page can resolve by signing the right user in. The others (essential acr
// values) can't be satisfied here and would loop back, so they end the flow.
const RESOLVABLE_REASONS = new Set([
  "no_session",
  "login_prompt",
  "max_age",
  "id_token_hint",
  "rekisteri_session",
  "active_membership",
]);

// The subject of the (already validated) id_token_hint
function hintedSubject(interaction: Interaction): string | undefined {
  const hint = interaction.params.id_token_hint;
  if (typeof hint !== "string") return undefined;
  try {
    return JSON.parse(Buffer.from(hint.split(".", 2)[1] ?? "", "base64url").toString("utf8")).sub;
  } catch {
    return undefined;
  }
}

function unresolvableReason(interaction: Interaction) {
  return interaction.prompt.name === "login"
    ? interaction.prompt.reasons.find((r) => !RESOLVABLE_REASONS.has(r))
    : undefined;
}

/**
 * The signed-in user, if their session can complete this interaction. prompt=login needs a sign-in
 * made during this interaction; max_age one made during it or within max_age seconds; id_token_hint
 * the hinted user. Otherwise the page asks the user to sign in again.
 */
function sessionUser(locals: App.Locals, interaction: Interaction) {
  if (!locals.user || !locals.session) return null;
  const reasons = interaction.prompt.reasons;
  const signedInAt = locals.session.createdAt.getTime();
  // iat has whole seconds, so a session from that same second could predate the interaction
  const signedInDuringInteraction = signedInAt >= (interaction.iat + 1) * 1000;
  if (reasons.includes("login_prompt") && !signedInDuringInteraction) return null;
  const maxAge = Number(interaction.params.max_age);
  const tooOld = Number.isFinite(maxAge) && signedInAt < Date.now() - maxAge * 1000;
  if (reasons.includes("max_age") && tooOld && !signedInDuringInteraction) return null;
  if (reasons.includes("id_token_hint") && hintedSubject(interaction) !== locals.user.id) return null;
  return { user: locals.user, authTime: Math.floor(locals.session.createdAt.getTime() / 1000) };
}

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  const uid = params.uid;
  const interaction = await getInteraction(event.cookies, uid);

  if (!interaction) {
    // Audited only for signed-in users, so anonymous requests can't fill the audit log
    if (!locals.user) redirect(302, "/oidc/error");
    const errorCode = await createAuditLog({
      userId: locals.user.id,
      action: "oidc_entity.error",
      metadata: {
        error: "interaction_not_found",
        error_description: "Consent interaction not found or expired",
        uid,
      },
      ipAddress: event.getClientAddress(),
      userAgent: event.request.headers.get("user-agent") || undefined,
    });
    redirect(302, `/oidc/error?code=${errorCode}`);
  }

  const unresolvable = unresolvableReason(interaction);
  if (unresolvable) {
    return finishInteraction(interaction, {
      error: "login_required",
      error_description: `Unsupported login requirement: ${unresolvable}`,
    });
  }

  const clientId = String(interaction.params.client_id ?? "");
  const requestedPrompt = typeof interaction.params.prompt === "string" ? interaction.params.prompt.split(" ") : [];
  const isForceConsent = requestedPrompt.includes("consent");

  const signedIn = sessionUser(locals, interaction);
  const currentUser = signedIn?.user ?? null;

  const [clientRows, consentRows] = await Promise.all([
    db.select().from(oidcClient).where(eq(oidcClient.clientId, clientId)),
    currentUser && clientId
      ? db
          .select()
          .from(oidcConsent)
          .where(and(eq(oidcConsent.userId, currentUser.id), eq(oidcConsent.clientId, clientId)))
      : Promise.resolve([]),
  ]);

  const [client] = clientRows;
  const existingConsent = consentRows[0] || null;

  if (!client) {
    const errorCode = await createAuditLog({
      userId: locals.user?.id,
      action: "oidc_entity.error",
      targetType: "oidc_client",
      targetId: clientId,
      metadata: {
        error: "client_not_found",
        error_description: "Client application not found",
        clientId,
        uid,
      },
      ipAddress: event.getClientAddress(),
      userAgent: event.request.headers.get("user-agent") || undefined,
    });
    redirect(302, `/oidc/error?code=${errorCode}`);
  }

  event.locals.oidcRedirectOrigins = [
    ...new Set(
      client.redirectUris.flatMap((uri) => {
        try {
          return [new URL(uri).origin];
        } catch {
          return [];
        }
      }),
    ),
  ];

  // Members-only clients: the page explains instead of asking for consent
  const membersOnly = signedIn ? !(await canUseClient(signedIn.user.id, client.clientId)) : false;
  const scopes = grantedScopes(interaction.params.scope, client.scopes);
  const alreadyApproved = existingConsent !== null && scopes.every((scope) => existingConsent.scopes.includes(scope));

  // AUTOMATIC AUTHORIZATION: the user already approved everything this request asks for
  if (signedIn && existingConsent && alreadyApproved && !isForceConsent && !membersOnly) {
    const provider = getOidcProvider();
    const grant = new provider.Grant({
      accountId: signedIn.user.id,
      clientId: client.clientId,
    });
    grant.addOIDCScope(scopes.join(" "));
    const grantId = await grant.save();

    await db
      .update(oidcConsent)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(oidcConsent.id, existingConsent.id));

    await auditFromEvent(event, "oidc_consent.create", {
      targetType: "oidc_client",
      targetId: client.clientId,
      metadata: { grantId, consentId: existingConsent.id, scopes, autoConsent: true },
    });

    const result = {
      login: { accountId: signedIn.user.id, ts: signedIn.authTime, remember: true },
      consent: { grantId },
    };

    return finishInteraction(interaction, result);
  }

  return {
    uid,
    client: {
      id: client.clientId,
      name: client.name,
    },
    // What this request will be granted, shown on the consent screen
    scopes,
    prompt: interaction.prompt,
    membersOnly,
    // Signed in, but the client asked for a fresh authentication
    reauthRequired: Boolean(locals.user) && !signedIn,
    user: currentUser
      ? {
          id: currentUser.id,
          email: currentUser.email,
          firstNames: currentUser.firstNames,
          lastName: currentUser.lastName,
        }
      : null,
  };
};

export const actions: Actions = {
  switchAccount: async (event) => {
    if (!(await getInteraction(event.cookies, event.params.uid))) redirect(302, "/oidc/error");
    if (event.locals.session) {
      await invalidateSession(event.locals.session.id);
      deleteSessionTokenCookie(event);
    }
    event.locals.user = null;
    event.locals.session = null;
    return { success: true };
  },
  accept: async (event) => {
    const { params, locals } = event;
    const uid = params.uid;
    const interaction = await getInteraction(event.cookies, uid);

    // Not signed in (anymore): back to the page, which shows the sign-in form
    if (interaction && !locals.user) redirect(303, `/oidc/login/${uid}`);
    if (!locals.user) redirect(302, "/oidc/error");

    if (!interaction) {
      const errorCode = await createAuditLog({
        userId: locals.user.id,
        action: "oidc_entity.error",
        metadata: {
          error: "interaction_expired",
          error_description: "Consent interaction expired during accept submission",
          uid,
        },
        ipAddress: event.getClientAddress(),
        userAgent: event.request.headers.get("user-agent") || undefined,
      });
      redirect(302, `/oidc/error?code=${errorCode}`);
    }

    const clientId = String(interaction.params.client_id ?? "");
    const [client] = await db.select().from(oidcClient).where(eq(oidcClient.clientId, clientId));

    if (unresolvableReason(interaction)) redirect(303, `/oidc/login/${uid}`);
    // A fresh login is required (prompt=login, max_age): back to the page, which asks for it
    const signedIn = sessionUser(locals, interaction);
    if (!signedIn) redirect(303, `/oidc/login/${uid}`);

    if (!client) {
      const errorCode = await createAuditLog({
        userId: locals.user.id,
        action: "oidc_entity.error",
        targetType: "oidc_client",
        targetId: clientId,
        metadata: {
          error: "client_not_found",
          error_description: "Client not found during accept submission",
          clientId,
          uid,
        },
        ipAddress: event.getClientAddress(),
        userAgent: event.request.headers.get("user-agent") || undefined,
      });
      redirect(302, `/oidc/error?code=${errorCode}`);
    }

    if (!(await canUseClient(locals.user.id, client.clientId))) {
      return finishInteraction(interaction, {
        error: "access_denied",
        error_description: "An active membership is required",
      });
    }

    const provider = getOidcProvider();
    const scopes = grantedScopes(interaction.params.scope, client.scopes);
    const [previous] = await db
      .select({ scopes: oidcConsent.scopes })
      .from(oidcConsent)
      .where(and(eq(oidcConsent.userId, locals.user.id), eq(oidcConsent.clientId, client.clientId)));
    const approvedScopes = [...new Set([...(previous?.scopes ?? []), ...scopes])];
    const [consentRow] = await db
      .insert(oidcConsent)
      .values({
        id: crypto.randomUUID(),
        userId: locals.user.id,
        clientId: client.clientId,
        scopes: approvedScopes,
      })
      .onConflictDoUpdate({
        target: [oidcConsent.userId, oidcConsent.clientId],
        set: {
          scopes: approvedScopes,
          updatedAt: new Date(),
        },
      })
      .returning({ id: oidcConsent.id });

    if (!consentRow) {
      throw new Error("Failed to save consent");
    }
    const consentId = consentRow.id;

    const grant = new provider.Grant({
      accountId: locals.user.id,
      clientId: client.clientId,
    });

    grant.addOIDCScope(scopes.join(" "));
    const grantId = await grant.save();

    await auditFromEvent(event, "oidc_consent.create", {
      targetType: "oidc_client",
      targetId: client.clientId,
      metadata: { grantId, consentId, scopes },
    });

    const result = {
      login: { accountId: locals.user.id, ts: signedIn.authTime, remember: true },
      consent: {
        grantId,
      },
    };

    return finishInteraction(interaction, result);
  },

  deny: async (event) => {
    const { locals, params } = event;
    const LL = getLL(locals.locale);
    const interaction = await getInteraction(event.cookies, params.uid);
    if (!interaction) {
      redirect(302, "/oidc/error");
    }

    const result = {
      error: "access_denied",
      error_description: LL.oidc.consent.deny(),
    };

    return finishInteraction(interaction, result);
  },
};
