import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as table from "../src/lib/server/db/schema";
import {
  createClient,
  decodeJwtPayload,
  getTokens,
  startOidcTestServer,
  userinfo,
  type OidcTestServer,
} from "./utils/oidc";

const CLIENT_ID = "claims-client";
const SECRET = "claims-secret";
const DAY = 86_400_000;

describe("OIDC claims per scope", () => {
  let server: OidcTestServer;

  async function createUser(id: string, email: string, extra: Partial<typeof table.user.$inferInsert> = {}) {
    await server.db.insert(table.user).values({ id, email, firstNames: "Testi", lastName: "Käyttäjä", ...extra });
  }

  async function addSecondaryEmail(userId: string, email: string, verifiedAt: Date | null, expiresAt: Date | null) {
    await server.db.insert(table.secondaryEmail).values({
      id: crypto.randomUUID(),
      userId,
      email,
      domain: email.split("@", 2)[1] ?? "",
      verifiedAt,
      expiresAt,
    });
  }

  async function addMembership(userId: string, typeId: string, start: Date, end: Date) {
    const membershipId = crypto.randomUUID();
    await server.db
      .insert(table.membership)
      .values({ id: membershipId, membershipTypeId: typeId, startTime: start, endTime: end });
    await server.db.insert(table.member).values({ id: crypto.randomUUID(), userId, membershipId, status: "active" });
  }

  /** Claims from the id_token, after checking userinfo returns the same ones. */
  async function claimsFor(userId: string, scope: string) {
    const tokens = await getTokens(server, { clientId: CLIENT_ID, secret: SECRET, userId, scope });
    const fromUserinfo = await userinfo(server, tokens.access_token);
    const fromIdToken = decodeJwtPayload(tokens.id_token);
    for (const [claim, value] of Object.entries(fromUserinfo.claims)) expect(fromIdToken[claim]).toEqual(value);
    return fromIdToken;
  }

  beforeAll(async () => {
    server = await startOidcTestServer();
    await createClient(server.db, {
      clientId: CLIENT_ID,
      secret: SECRET,
      scopes: ["openid", "profile", "email", "membership"],
    });
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  it("profile scope returns name, locale and aalto_email_verified, nothing from other scopes", async () => {
    await createUser("profile-user", "profile@aalto.fi", { preferredLanguage: "english" });

    const claims = await claimsFor("profile-user", "openid profile");
    expect(claims).toMatchObject({
      sub: "profile-user",
      given_name: "Testi",
      family_name: "Käyttäjä",
      locale: "en",
      aalto_email_verified: true,
    });
    expect(claims.email).toBeUndefined();
    expect(claims.active_memberships).toBeUndefined();
  });

  it("aalto_email_verified counts only secondary aalto.fi addresses whose verification hasn't expired", async () => {
    await createUser("expired-aalto", "expired@example.com");
    await addSecondaryEmail(
      "expired-aalto",
      "expired@aalto.fi",
      new Date(Date.now() - 200 * DAY),
      new Date(Date.now() - DAY),
    );
    expect((await claimsFor("expired-aalto", "openid profile")).aalto_email_verified).toBe(false);

    await createUser("valid-aalto", "valid@example.com");
    await addSecondaryEmail("valid-aalto", "valid@aalto.fi", new Date(), new Date(Date.now() + 100 * DAY));
    expect((await claimsFor("valid-aalto", "openid profile")).aalto_email_verified).toBe(true);
  });

  it("email scope returns the standard email claims and only currently verified addresses", async () => {
    await createUser("email-user", "primary@example.com", { isAllowedEmails: true });
    await addSecondaryEmail("email-user", "second@example.com", new Date(), null);
    await addSecondaryEmail("email-user", "unverified@example.com", null, null);
    await addSecondaryEmail("email-user", "old@aalto.fi", new Date(Date.now() - 200 * DAY), new Date(Date.now() - DAY));

    const claims = await claimsFor("email-user", "openid email");
    expect(claims).toMatchObject({ email: "primary@example.com", email_verified: true, optional_emails_allowed: true });
    expect(claims.verified_emails).toEqual(["primary@example.com", "second@example.com"]);
    expect(claims.given_name).toBeUndefined();
  });

  it("membership scope lists only memberships active right now", async () => {
    await createUser("member-user", "member@example.com");
    const [type] = await server.db
      .insert(table.membershipType)
      .values({ id: "claims-type", name: { fi: "Jäsen", en: "Member" } })
      .returning();
    if (!type) throw new Error("Failed to create membership type");
    await addMembership("member-user", type.id, new Date(Date.now() - DAY), new Date(Date.now() + DAY));
    // Status still active, but the period is over
    await addMembership("member-user", type.id, new Date(Date.now() - 400 * DAY), new Date(Date.now() - 35 * DAY));

    const claims = await claimsFor("member-user", "openid membership");
    expect(claims.active_memberships).toEqual(["claims-type"]);

    await createUser("former-member", "former@example.com");
    await addMembership("former-member", type.id, new Date(Date.now() - 50 * DAY), new Date(Date.now() - 36 * DAY));
    expect((await claimsFor("former-member", "openid membership")).active_memberships).toEqual([]);
  });

  it("returns only the scopes the request asked for, even if the client may use more", async () => {
    await createUser("openid-only", "openid-only@aalto.fi");

    const tokens = await getTokens(server, {
      clientId: CLIENT_ID,
      secret: SECRET,
      userId: "openid-only",
      scope: "openid",
    });
    expect(tokens.scope).toBe("openid");
    const claims = decodeJwtPayload(tokens.id_token);
    expect(claims.sub).toBe("openid-only");
    for (const claim of ["given_name", "email", "aalto_email_verified", "active_memberships"]) {
      expect(claims[claim]).toBeUndefined();
    }
  });
});
