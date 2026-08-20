/**
 * @file adapter.ts
 * @description Drizzle ORM Database Adapter for oidc-provider.
 *
 * `oidc-provider` expects a custom `Adapter` class to persist and manage OIDC protocol entities:
 * - Clients (`Client`): Application registrations and allowed scopes / origins / redirect URIs.
 * - User Consent & Grants (`Grant`): User authorization decisions and granted scopes.
 * - User Interactions (`Interaction`): Temporary multi-step login and consent prompt sessions.
 * - Tokens & Sessions (`AuthorizationCode`, `RefreshToken`, `Session`): Single-use codes, long-lived refresh tokens, and user sessions.
 *
 * This adapter maps these entities to PostgreSQL database tables managed by Drizzle ORM:
 * - `oidc_client`: Application client credentials and configurations.
 * - `oidc_consent`: Permanent user authorization / consent records.
 * - `oidc_entity`: Unified runtime document store for all ephemeral OIDC payloads (interactions, tokens, sessions, grants).
 */

import type { Adapter, AdapterPayload } from "oidc-provider";
import { db } from "$lib/server/db";
import { oidcEntity, oidcClient, oidcConsent } from "$lib/server/db/schema";
import { eq, and, or, sql } from "drizzle-orm";

/**
 * Finds an OIDC client registration by client ID.
 *
 * Formats scope strings, allowed origins, and adds `refresh_token` to `grant_types`
 * if the client registration includes the `offline_access` scope.
 *
 * @param id - The client ID.
 * @returns Formatted AdapterPayload for oidc-provider, or undefined if not found.
 */
async function findClient(id: string): Promise<AdapterPayload | undefined> {
  const [client] = await db.select().from(oidcClient).where(eq(oidcClient.clientId, id));
  if (!client) return undefined;

  const primaryGrant = client.type || "authorization_code";
  const grantTypes: string[] = [primaryGrant];
  if (Array.isArray(client.scopes) && client.scopes.includes("offline_access")) {
    grantTypes.push("refresh_token");
  }

  const responseTypes = grantTypes.includes("authorization_code") ? ["code"] : [];

  return {
    client_id: client.clientId,
    client_secret: client.clientSecret || undefined,
    redirect_uris: client.redirectUris,
    allowed_origins: client.allowedOrigins || [],
    allowedOrigins: client.allowedOrigins || [],
    grant_types: grantTypes,
    response_types: responseTypes,
    scope: Array.isArray(client.scopes) ? client.scopes.join(" ") : "openid",
  } as AdapterPayload;
}

/**
 * Helper to check expiration and automatically prune expired oidc_entity records.
 */
async function isExpired(row: { jti: string; expiresAt: Date | null }): Promise<boolean> {
  if (row.expiresAt && row.expiresAt < new Date()) {
    await db.delete(oidcEntity).where(eq(oidcEntity.jti, row.jti));
    return true;
  }
  return false;
}

/**
 * Finds a generic OIDC entity from `oidc_entity` by its JTI / token / ID.
 * Auto-deletes expired records and returns undefined.
 */
async function findEntity(id: string): Promise<AdapterPayload | undefined> {
  const [row] = await db.select().from(oidcEntity).where(eq(oidcEntity.jti, id));
  if (!row || (await isExpired(row))) return undefined;
  return row.payload as AdapterPayload;
}

/**
 * Finds a Grant entity by grant JTI or fallback consent ID.
 *
 * Checks `oidc_entity` first for the runtime grant payload.
 * Falls back to `oidc_consent` if looking up by permanent consent ID.
 *
 * @param id - The grant identifier or consent ID.
 * @returns The Grant payload, or undefined if not found or expired.
 */
async function findGrant(id: string): Promise<AdapterPayload | undefined> {
  const entity = await findEntity(id);
  if (entity) return entity;

  const [consentRow] = await db.select().from(oidcConsent).where(eq(oidcConsent.id, id));
  if (!consentRow) return undefined;

  return {
    jti: consentRow.id,
    clientId: consentRow.clientId,
    accountId: consentRow.userId,
    openid: { scope: "openid" },
    resources: {},
  } as AdapterPayload;
}

/**
 * Resolves and sets `clientId` and `consentId` columns whenever they are available in the payload.
 */
async function resolveClientIdAndConsentId(
  name: string,
  _id: string,
  payload: AdapterPayload,
): Promise<{ clientId: string | null; consentId: string | null }> {
  const payloadObj = payload as Record<string, unknown>;
  const params = (payloadObj.params || {}) as Record<string, unknown>;
  const session = (payloadObj.session || {}) as Record<string, unknown>;

  // 1. Resolve clientId
  let clientId: string | null =
    (payloadObj.clientId as string) ||
    (payloadObj.client_id as string) ||
    (params.client_id as string) ||
    (params.clientId as string) ||
    null;

  // 2. Resolve userId
  const userId: string | null =
    (payloadObj.accountId as string) || (payloadObj.sub as string) || (session.accountId as string) || null;

  // 3. Resolve consentId
  let consentId: string | null = (payloadObj.consentId as string) || (payloadObj.consent_id as string) || null;

  // If payload has grantId (which is the Grant JTI), lookup the Grant entity's consentId
  const grantId = (payloadObj.grantId as string) || null;
  if (!consentId && grantId) {
    const [grantRow] = await db
      .select({ consentId: oidcEntity.consentId, clientId: oidcEntity.clientId })
      .from(oidcEntity)
      .where(eq(oidcEntity.jti, grantId));
    if (grantRow) {
      if (grantRow.consentId) consentId = grantRow.consentId;
      if (!clientId && grantRow.clientId) clientId = grantRow.clientId;
    } else {
      const [consentRow] = await db
        .select({ id: oidcConsent.id, clientId: oidcConsent.clientId })
        .from(oidcConsent)
        .where(eq(oidcConsent.id, grantId));
      if (consentRow) {
        consentId = consentRow.id;
        if (!clientId) clientId = consentRow.clientId;
      }
    }
  }

  // 4. If consentId is not resolved yet, check existing consent for userId + clientId
  if (userId && clientId && !consentId) {
    const [existingConsent] = await db
      .select({ id: oidcConsent.id })
      .from(oidcConsent)
      .where(and(eq(oidcConsent.userId, userId), eq(oidcConsent.clientId, clientId)));
    if (existingConsent) {
      consentId = existingConsent.id;
    } else if (name === "Grant") {
      const newConsentId = crypto.randomUUID();
      await db
        .insert(oidcConsent)
        .values({
          id: newConsentId,
          userId,
          clientId,
        })
        .onConflictDoNothing();
      consentId = newConsentId;
    }
  }

  return { clientId, consentId };
}

/**
 * Custom database adapter implementation for `oidc-provider`.
 * Implements the required lifecycle methods: `upsert`, `find`, `findByUid`, `destroy`, `revokeByGrantId`, `consume`.
 */
export class DrizzleOidcAdapter implements Adapter {
  /** Model name passed by oidc-provider (e.g., "Client", "Grant", "Interaction", "AuthorizationCode", "RefreshToken") */
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Persists or updates an OIDC model entity in the database.
   *
   * @param id - Entity identifier (token string, interaction UID, or grant JTI).
   * @param payload - Entity payload data emitted by oidc-provider.
   * @param expiresIn - Lifetime in seconds, used to compute `expiresAt`.
   */
  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    // Access tokens are omitted in Rekisteri (only ID tokens & refresh tokens are used)
    if (this.name === "AccessToken") {
      return;
    }

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    const { clientId, consentId } = await resolveClientIdAndConsentId(this.name, id, payload);
    const jti = this.name === "Interaction" && payload.uid ? (payload.uid as string) : id;

    await db
      .insert(oidcEntity)
      .values({
        jti,
        payload,
        consentId,
        clientId,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: oidcEntity.jti,
        set: {
          payload,
          consentId,
          clientId,
          expiresAt,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Finds an OIDC model entity in the database by its ID / JTI.
   *
   * @param id - Entity identifier.
   * @returns The adapter payload object or undefined if not found/expired.
   */
  async find(id: string): Promise<AdapterPayload | undefined> {
    if (this.name === "AccessToken") {
      return undefined;
    }
    if (this.name === "Client") {
      return findClient(id);
    }
    if (this.name === "Grant") {
      return findGrant(id);
    }
    return findEntity(id);
  }

  /**
   * Device code lookup (unused in authorization_code flow).
   */
  // fallow-ignore-next-line unused-class-member
  async findByUserCode(_userCode: string): Promise<AdapterPayload | undefined> {
    return undefined;
  }

  /**
   * Finds an Interaction or Session entity by user interaction UID.
   *
   * @param uid - Interaction UID string.
   */
  // fallow-ignore-next-line unused-class-member
  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    if (this.name === "Interaction") {
      return findEntity(uid);
    }

    if (this.name === "Session") {
      const [row] = await db
        .select()
        .from(oidcEntity)
        .where(sql`${oidcEntity.payload}->>'uid' = ${uid}`);
      if (!row || (await isExpired(row))) return undefined;
      return row.payload as AdapterPayload;
    }

    return undefined;
  }

  /**
   * Destroys/deletes an OIDC entity record from the database.
   *
   * @param id - Entity identifier to delete.
   */
  async destroy(id: string): Promise<void> {
    await db
      .delete(oidcEntity)
      .where(
        or(
          eq(oidcEntity.jti, id),
          sql`${oidcEntity.payload}->>'grantId' = ${id}`,
          sql`${oidcEntity.payload}->>'uid' = ${id}`,
        ),
      );
  }

  /**
   * Revokes all active entities and consent records associated with a specific grant/consent ID.
   *
   * @param grantId - Grant JTI or consent identifier.
   */
  // fallow-ignore-next-line unused-class-member
  async revokeByGrantId(grantId: string): Promise<void> {
    const [grantRow] = await db
      .select({ consentId: oidcEntity.consentId })
      .from(oidcEntity)
      .where(eq(oidcEntity.jti, grantId));
    const consentId = grantRow?.consentId || grantId;

    // Deleting oidc_consent cascades to all oidc_entity rows with matching consentId
    await db.delete(oidcConsent).where(eq(oidcConsent.id, consentId));

    // Also clean up any unlinked entities by grant JTI or payload grantId
    await db
      .delete(oidcEntity)
      .where(or(eq(oidcEntity.jti, grantId), sql`${oidcEntity.payload}->>'grantId' = ${grantId}`));
  }

  /**
   * Marks a single-use token (such as an AuthorizationCode) as consumed.
   * Immediately destroys authorization codes to prevent code reuse attacks.
   *
   * @param id - Token identifier.
   */
  // fallow-ignore-next-line unused-class-member
  async consume(id: string): Promise<void> {
    if (this.name === "AuthorizationCode") {
      await this.destroy(id);
      return;
    }

    const row = await this.find(id);
    if (row) {
      row.consumed = Math.floor(Date.now() / 1000);
      await this.upsert(id, row, row.exp ? Math.max(0, row.exp - Math.floor(Date.now() / 1000)) : 0);
    }
  }
}
