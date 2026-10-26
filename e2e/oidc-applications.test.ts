import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { hashClientSecret } from "../src/lib/server/oidc/secret";
import {
  REDIRECT_URI,
  createSessionCookie,
  createTestContext,
  generatePkce,
  getBaseUrl,
  waitForCallbackUrl,
} from "./helpers/oidc";

// A user sees the apps they've connected in their settings and can revoke access.

const CLIENT_ID = "oidc-e2e-applications";
const SECRET = "sec_e2e_applications";
const USER_ID = "oidc-e2e-applications-user";
const ALLOW_BUTTON = /Salli pääsy|Allow access/i;

function authUrl(challenge: string) {
  return `${getBaseUrl()}/oidc/authorize?${new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid profile",
    state: "s",
    code_challenge: challenge,
    code_challenge_method: "S256",
  })}`;
}

test.describe("Connected applications", () => {
  test.beforeEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.insert(table.oidcClient).values({
      clientId: CLIENT_ID,
      name: "E2E Connected App",
      clientSecret: hashClientSecret(SECRET),
      redirectUris: [REDIRECT_URI],
      scopes: ["openid", "profile"],
    });
    await db.insert(table.user).values({ id: USER_ID, email: "oidc-applications@example.com" }).onConflictDoNothing();
  });

  test.afterEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.delete(table.session).where(eq(table.session.userId, USER_ID));
    await db.delete(table.auditLog).where(eq(table.auditLog.userId, USER_ID));
    await db.delete(table.user).where(eq(table.user.id, USER_ID));
  });

  test("revoking an app ends its access and asks for consent again", async ({ browser, db, request }) => {
    const context = await createTestContext(browser);
    await context.addCookies([await createSessionCookie(db, USER_ID)]);
    const page = await context.newPage();

    // Connect the app and get an access token
    const pkce = generatePkce();
    await page.goto(authUrl(pkce.challenge));
    const callback = await waitForCallbackUrl(page, () => page.getByRole("button", { name: ALLOW_BUTTON }).click());
    const tokenRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: { authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64")}` },
      form: {
        grant_type: "authorization_code",
        code: callback.searchParams.get("code") ?? "",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });
    const { access_token: accessToken } = await tokenRes.json();
    const userinfo = () =>
      request.get(`${getBaseUrl()}/oidc/userinfo`, { headers: { authorization: `Bearer ${accessToken}` } });
    expect((await userinfo()).status()).toBe(200);

    // The app is listed in the settings, with the approved scope
    const settings = await context.newPage();
    await settings.goto("/en/settings/applications");
    const row = settings.getByTestId(`grant-row-${CLIENT_ID}`);
    await expect(row).toContainText("E2E Connected App");
    await expect(row).toContainText("Profile");

    // Revoke
    await row.getByRole("button", { name: "Revoke Access" }).click();
    await expect(row).toBeHidden();
    expect((await userinfo()).status()).toBe(401);

    // Signing in to the app again asks for consent
    const again = await context.newPage();
    await again.goto(authUrl(generatePkce().challenge));
    await expect(again.getByRole("button", { name: ALLOW_BUTTON })).toBeVisible();
    await context.close();
  });
});
