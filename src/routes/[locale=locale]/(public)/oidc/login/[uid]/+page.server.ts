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

// Grant only what this request asked for, limited to the scopes the client is allowed
function grantedScopes(requested: unknown, clientScopes: string[]): string {
  const allowed = new Set(["openid", ...clientScopes]);
  const requestedScopes = typeof requested === "string" ? requested.split(" ") : [];
  return requestedScopes.filter((scope) => allowed.has(scope)).join(" ");
}

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  const targetLocale = (params.locale as string) || locals.locale || "fi";
  const uid = params.uid;
  const interaction = await getInteraction(event.cookies, uid);

  if (!interaction) {
    const errorCode = await createAuditLog({
      userId: locals.user?.id,
      action: "oidc_entity.error",
      metadata: {
        error: "interaction_not_found",
        error_description: "Consent interaction not found or expired",
        uid,
      },
      ipAddress: event.getClientAddress(),
      userAgent: event.request.headers.get("user-agent") || undefined,
    });
    redirect(302, `/${targetLocale}/oidc/error?code=${errorCode}`);
  }

  const clientId = String(interaction.params.client_id ?? "");
  const requestedPrompt = typeof interaction.params.prompt === "string" ? interaction.params.prompt.split(" ") : [];
  const isForceConsent = requestedPrompt.includes("consent");

  const currentUser = locals.user;

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
    redirect(302, `/${targetLocale}/oidc/error?code=${errorCode}`);
  }

  // AUTOMATIC AUTHORIZATION:
  if (currentUser && existingConsent && !isForceConsent) {
    const provider = getOidcProvider();
    const grant = new provider.Grant({
      accountId: currentUser.id,
      clientId: client.clientId,
    });
    grant.addOIDCScope(grantedScopes(interaction.params.scope, client.scopes));
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
      metadata: { grantId, consentId: existingConsent.id, scopes: client.scopes, autoConsent: true },
    });

    const result = {
      login: { accountId: currentUser.id, remember: true },
      consent: { grantId },
    };

    return finishInteraction(interaction, result);
  }

  return {
    uid,
    client: {
      id: client.clientId,
      name: client.name,
      scopes: client.scopes,
    },
    prompt: interaction.prompt,
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
    const targetLocale = (params.locale as string) || locals.locale || "fi";
    if (!locals.user) {
      const errorCode = await createAuditLog({
        action: "oidc_entity.error",
        metadata: {
          error: "unauthorized",
          error_description: "User is not logged in",
          uid: params.uid,
        },
        ipAddress: event.getClientAddress(),
        userAgent: event.request.headers.get("user-agent") || undefined,
      });
      redirect(302, `/${targetLocale}/oidc/error?code=${errorCode}`);
    }

    const uid = params.uid;

    const interaction = await getInteraction(event.cookies, uid);

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
      redirect(302, `/${targetLocale}/oidc/error?code=${errorCode}`);
    }

    const clientId = String(interaction.params.client_id ?? "");
    const [client] = await db.select().from(oidcClient).where(eq(oidcClient.clientId, clientId));

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
      redirect(302, `/${targetLocale}/oidc/error?code=${errorCode}`);
    }

    const provider = getOidcProvider();
    const [consentRow] = await db
      .insert(oidcConsent)
      .values({
        id: crypto.randomUUID(),
        userId: locals.user.id,
        clientId: client.clientId,
      })
      .onConflictDoUpdate({
        target: [oidcConsent.userId, oidcConsent.clientId],
        set: {
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

    grant.addOIDCScope(grantedScopes(interaction.params.scope, client.scopes));
    const grantId = await grant.save();

    await auditFromEvent(event, "oidc_consent.create", {
      targetType: "oidc_client",
      targetId: client.clientId,
      metadata: { grantId, consentId },
    });

    const result = {
      login: { accountId: locals.user.id, remember: true },
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
      redirect(302, `/${locals.locale}/oidc/error`);
    }

    const result = {
      error: "access_denied",
      error_description: LL.oidc.consent.deny(),
    };

    return finishInteraction(interaction, result);
  },
};
