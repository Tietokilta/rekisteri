import { redirect } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { db } from "$lib/server/db";
import { oidcClient, oidcConsent, oidcEntity } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { getOidcProvider } from "$lib/server/oidc/provider";
import { getLL } from "$lib/server/i18n";
import { finishInteraction } from "$lib/server/oidc/bridge";
import { invalidateSession, deleteSessionTokenCookie } from "$lib/server/auth/session";
import { auditFromEvent, createAuditLog } from "$lib/server/audit";

function buildGrantScopes(clientScopes?: string[]): string {
  const clientAllowed = Array.isArray(clientScopes) ? clientScopes : ["openid"];
  const finalScopes = new Set<string>(["openid", ...clientAllowed]);
  return Array.from(finalScopes).join(" ");
}

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  const targetLocale = (params.locale as string) || locals.locale || "fi";
  const uid = params.uid;
  const [payloadRow] = await db.select().from(oidcEntity).where(eq(oidcEntity.jti, uid));

  if (!payloadRow) {
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

  const interaction = payloadRow.payload as {
    prompt?: { name?: string };
    params?: { client_id?: string; scope?: string; prompt?: string };
    session?: { accountId?: string };
  };

  const clientId = interaction.params?.client_id || "";
  const requestedPrompt = interaction.params?.prompt ? interaction.params.prompt.split(" ") : [];
  const isForceConsent = requestedPrompt.includes("consent");

  const [client] = await db.select().from(oidcClient).where(eq(oidcClient.clientId, clientId));

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

  const currentUser = locals.user;

  let existingConsent = null;
  if (currentUser) {
    const [consent] = await db
      .select()
      .from(oidcConsent)
      .where(and(eq(oidcConsent.userId, currentUser.id), eq(oidcConsent.clientId, client.clientId)));

    if (consent) {
      existingConsent = consent;
    }
  }

  // AUTOMATIC AUTHORIZATION:
  if (currentUser && existingConsent && !isForceConsent) {
    const provider = getOidcProvider();
    const grant = new provider.Grant({
      accountId: currentUser.id,
      clientId: client.clientId,
    });
    grant.addOIDCScope(buildGrantScopes(client.scopes));
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

    return finishInteraction(event, provider, result);
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

    const [payloadRow] = await db.select().from(oidcEntity).where(eq(oidcEntity.jti, uid));

    if (!payloadRow) {
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

    const interaction = (payloadRow.payload || {}) as Record<string, unknown>;
    const interactionParams = (interaction.params || {}) as Record<string, string>;
    const clientId = interactionParams.client_id || "";
    const currentRedirectUri = interactionParams.redirect_uri || "";
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

    const currentLocale = (params.locale as string) || locals.locale || "fi";
    const otherLocale = currentLocale === "fi" ? "en" : "fi";

    if (currentRedirectUri && Array.isArray(client.redirectUris)) {
      const swappedUri = currentRedirectUri.replace(new RegExp(`/${otherLocale}(/|$)`), `/${currentLocale}$1`);
      if (swappedUri !== currentRedirectUri && client.redirectUris.includes(swappedUri)) {
        interactionParams.redirect_uri = swappedUri;
        await db
          .update(oidcEntity)
          .set({
            payload: {
              ...interaction,
              params: interactionParams,
            },
            updatedAt: new Date(),
          })
          .where(eq(oidcEntity.jti, uid));
      }
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

    grant.addOIDCScope(buildGrantScopes(client.scopes));
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

    return finishInteraction(event, provider, result);
  },

  deny: async (event) => {
    const { locals } = event;
    const LL = getLL(locals.locale);
    const provider = getOidcProvider();

    const result = {
      error: "access_denied",
      error_description: LL.oidc.consent.deny(),
    };

    return finishInteraction(event, provider, result);
  },
};
