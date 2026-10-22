import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { BrowserContext } from "@playwright/test";
import { hashClientSecret } from "../src/lib/server/oidc/secret";
import {
  REDIRECT_URI,
  createSessionCookie,
  createTestContext,
  generatePkce,
  getBaseUrl,
  waitForCallbackUrl,
  type TestDb,
} from "./helpers/oidc";

// Clients marked members-only turn away users without an active membership, also when a provider
// session and grant from earlier would otherwise sign them in without the login page.

const CLIENT_ID = "oidc-e2e-members-only";
const USER_ID = "oidc-e2e-members-only-user";
const ALLOW_BUTTON = /Salli pääsy|Allow access/i;

function authUrl(challenge = generatePkce().challenge) {
  return `${getBaseUrl()}/oidc/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid&state=s&code_challenge=${challenge}&code_challenge_method=S256`;
}

async function giveActiveMembership(db: TestDb) {
  const [membershipType] = await db.select().from(table.membershipType).limit(1);
  if (!membershipType) throw new Error("Seed data has no membership types");
  const membershipId = crypto.randomUUID();
  // Random start keeps (type, start time) unique across runs
  const startTime = new Date(Date.now() - 86_400_000 - Math.floor(Math.random() * 1_000_000));
  await db.insert(table.membership).values({
    id: membershipId,
    membershipTypeId: membershipType.id,
    startTime,
    endTime: new Date(Date.now() + 86_400_000),
  });
  await db.insert(table.member).values({ id: crypto.randomUUID(), userId: USER_ID, membershipId, status: "active" });
  return membershipId;
}

async function startSignIn(context: BrowserContext, challenge?: string) {
  const page = await context.newPage();
  let reachedCallback = false;
  page.on("request", (req) => {
    if (req.url().startsWith(REDIRECT_URI)) reachedCallback = true;
  });
  try {
    await page.goto(authUrl(challenge));
  } catch {
    // An unexpected redirect to the unhosted callback errors out; reachedCallback tells the story
  }
  return { page, reachedCallback: () => reachedCallback };
}

test.describe("OIDC members-only clients", () => {
  let membershipIds: string[] = [];

  test.beforeEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.insert(table.oidcClient).values({
      clientId: CLIENT_ID,
      name: "E2E Members Only",
      clientSecret: hashClientSecret("sec_e2e_members_only"),
      redirectUris: [REDIRECT_URI],
      scopes: ["openid"],
      requireActiveMembership: true,
    });
    await db.insert(table.user).values({ id: USER_ID, email: "oidc-members-only@example.com" }).onConflictDoNothing();
  });

  test.afterEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.delete(table.member).where(eq(table.member.userId, USER_ID));
    for (const id of membershipIds) await db.delete(table.membership).where(eq(table.membership.id, id));
    membershipIds = [];
    await db.delete(table.session).where(eq(table.session.userId, USER_ID));
    await db.delete(table.auditLog).where(eq(table.auditLog.userId, USER_ID));
    await db.delete(table.user).where(eq(table.user.id, USER_ID));
  });

  test("a user without a membership is turned away with access_denied", async ({ browser, db }) => {
    const context = await createTestContext(browser);
    await context.addCookies([await createSessionCookie(db, USER_ID)]);

    const { page, reachedCallback } = await startSignIn(context);
    await expect(page.getByTestId("oidc-members-only")).toBeVisible();
    expect(reachedCallback()).toBe(false);

    const callback = await waitForCallbackUrl(page, () =>
      page.getByRole("button", { name: /Peruuta|Cancel/i }).click(),
    );
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("code")).toBeNull();
    await context.close();
  });

  test("a member can sign in, and losing the membership stops later sign-ins", async ({ browser, db, request }) => {
    membershipIds.push(await giveActiveMembership(db));
    const context = await createTestContext(browser);
    await context.addCookies([await createSessionCookie(db, USER_ID)]);

    const pkce = generatePkce();
    const first = await startSignIn(context, pkce.challenge);
    const callback = await waitForCallbackUrl(first.page, () =>
      first.page.getByRole("button", { name: ALLOW_BUTTON }).click(),
    );
    expect(callback.searchParams.get("code")).toBeTruthy();

    // The membership ends; the provider session and grant are still there
    await db.delete(table.member).where(eq(table.member.userId, USER_ID));

    // The code issued while they were a member can't be exchanged anymore
    const tokenRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: { authorization: `Basic ${Buffer.from(`${CLIENT_ID}:sec_e2e_members_only`).toString("base64")}` },
      form: {
        grant_type: "authorization_code",
        code: callback.searchParams.get("code") ?? "",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });
    expect(tokenRes.status()).toBe(400);
    expect((await tokenRes.json()).error).toBe("invalid_grant");

    const second = await startSignIn(context);
    expect(second.reachedCallback()).toBe(false);
    await expect(second.page.getByTestId("oidc-members-only")).toBeVisible();
    await context.close();
  });
});
