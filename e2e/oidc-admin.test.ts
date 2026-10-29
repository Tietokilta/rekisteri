import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import {
  REDIRECT_URI,
  createSessionCookie,
  createTestContext,
  generatePkce,
  getBaseUrl,
  waitForCallbackUrl,
} from "./helpers/oidc";

// An admin registers an application in the settings and it works for signing in.

test.describe("OIDC applications admin", () => {
  const name = `E2E Admin App ${crypto.randomUUID().slice(0, 8)}`;

  test.afterEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.name, name));
  });

  test("create an application, sign in with it, make it members-only and delete it", async ({
    adminPage,
    adminUser,
    browser,
    db,
    request,
  }) => {
    await adminPage.goto("/en/admin/settings");
    await adminPage.getByTestId("tab-oidc-clients").click();

    // Create, with the profile scope and refresh tokens
    await adminPage.getByRole("button", { name: "New application" }).click();
    await adminPage.locator("#create-app-name").fill(name);
    await adminPage.locator("#create-redirect-uris").fill(REDIRECT_URI);
    await adminPage.getByTestId("scope_category_create_profile").check();
    await adminPage.getByTestId("scope_category_create_offline_access").check();
    await adminPage.getByRole("button", { name: "Create", exact: true }).click();

    // The secret is shown once
    const secretDialog = adminPage.getByRole("alertdialog").filter({ hasText: "New client secret generated" });
    const secret = (await secretDialog.locator("code").textContent())?.trim() ?? "";
    expect(secret).toMatch(/^sec_/);
    const [client] = await db.select().from(table.oidcClient).where(eq(table.oidcClient.name, name));
    if (!client) throw new Error("Client was not created");
    expect(client.scopes).toEqual(expect.arrayContaining(["openid", "profile", "offline_access"]));
    expect(client.redirectUris).toEqual([REDIRECT_URI]);
    expect(client.requireActiveMembership).toBe(false);

    // Sign in with it and exchange the code using the shown secret
    const context = await createTestContext(browser);
    await context.addCookies([await createSessionCookie(db, adminUser.id)]);
    const page = await context.newPage();
    const pkce = generatePkce();
    await page.goto(
      `${getBaseUrl()}/oidc/authorize?${new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: "openid profile",
        state: "s",
        code_challenge: pkce.challenge,
        code_challenge_method: "S256",
      })}`,
    );
    const callback = await waitForCallbackUrl(page, () =>
      page.getByRole("button", { name: /Allow access|Salli pääsy/ }).click(),
    );
    const tokenRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: { authorization: `Basic ${Buffer.from(`${client.clientId}:${secret}`).toString("base64")}` },
      form: {
        grant_type: "authorization_code",
        code: callback.searchParams.get("code") ?? "",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });
    expect(tokenRes.status()).toBe(200);
    await context.close();

    // Make it members-only
    await secretDialog.getByRole("button", { name: "Done" }).click();
    const row = adminPage.getByTestId(`oidc-client-row-${client.clientId}`);
    await row.getByTitle("Edit").click();
    await adminPage.getByRole("checkbox", { name: /Members only/ }).click();
    await adminPage.getByRole("button", { name: "Save", exact: true }).click();
    await expect(row.getByText("Members only")).toBeVisible();
    const [updated] = await db.select().from(table.oidcClient).where(eq(table.oidcClient.clientId, client.clientId));
    expect(updated?.requireActiveMembership).toBe(true);

    // Delete it
    await row.getByTitle("Delete").click();
    await adminPage.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(row).toBeHidden();
    expect(await db.select().from(table.oidcClient).where(eq(table.oidcClient.clientId, client.clientId))).toHaveLength(
      0,
    );
  });
});

test.describe("OIDC applications admin validation", () => {
  const name = `E2E Invalid App ${crypto.randomUUID().slice(0, 8)}`;

  test("rejects redirect URIs oidc-provider wouldn't accept", async ({ adminPage, db }) => {
    await adminPage.goto("/en/admin/settings");
    await adminPage.getByTestId("tab-oidc-clients").click();
    await adminPage.getByRole("button", { name: "New application" }).click();
    await adminPage.locator("#create-app-name").fill(name);
    await adminPage.locator("#create-redirect-uris").fill("http://app.example.com/callback\njavascript:alert(1)");
    await adminPage.getByRole("button", { name: "Create", exact: true }).click();

    await expect(adminPage.getByText(/Redirect URIs must be absolute https URLs/)).toBeVisible();
    expect(await db.select().from(table.oidcClient).where(eq(table.oidcClient.name, name))).toHaveLength(0);
  });
});

test.describe("OIDC applications admin create dialog", () => {
  const name = `E2E Reset App ${crypto.randomUUID().slice(0, 8)}`;

  test.afterEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.name, name));
  });

  test("starts from the defaults every time it opens", async ({ adminPage, db }) => {
    const dialog = adminPage.getByRole("alertdialog");
    const nameInput = adminPage.locator("#create-app-name");
    const redirectInput = adminPage.locator("#create-redirect-uris");
    const membersOnly = dialog.getByRole("checkbox", { name: /Members only/ });
    const scope = (key: string) => adminPage.getByTestId(`scope_category_create_${key}`);
    const issue = dialog.getByText(/Redirect URIs must be absolute https URLs/);

    const expectDefaults = async () => {
      await expect(nameInput).toHaveValue("");
      await expect(redirectInput).toHaveValue("");
      await expect(membersOnly).not.toBeChecked();
      await expect(scope("profile")).toBeChecked();
      await expect(scope("email")).toBeChecked();
      await expect(scope("membership")).toBeChecked();
      await expect(scope("offline_access")).not.toBeChecked();
      await expect(issue).toBeHidden();
    };

    await adminPage.goto("/en/admin/settings");
    await adminPage.getByTestId("tab-oidc-clients").click();
    const openDialog = () => adminPage.getByRole("button", { name: "New application" }).click();

    // A rejected submit, then cancel: the issue and the typed values don't come back
    await openDialog();
    await expectDefaults();
    await nameInput.fill(name);
    await redirectInput.fill("javascript:alert(1)");
    await membersOnly.click();
    await scope("offline_access").check();
    await adminPage.getByRole("button", { name: "Create", exact: true }).click();
    await expect(issue).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await openDialog();
    await expectDefaults();

    // Reopening with the keyboard while the close animation is still running
    await nameInput.fill(name);
    await scope("offline_access").check();
    await adminPage.keyboard.press("Escape");
    await adminPage.keyboard.press("Enter");
    await expectDefaults();

    // A successful create with non-default choices
    await nameInput.fill(name);
    await redirectInput.fill(REDIRECT_URI);
    await membersOnly.click();
    await scope("offline_access").check();
    await scope("profile").uncheck();
    await adminPage.getByRole("button", { name: "Create", exact: true }).click();
    const secretDialog = adminPage.getByRole("alertdialog").filter({ hasText: "New client secret generated" });
    await secretDialog.getByRole("button", { name: "Done" }).click();
    await expect(secretDialog).toBeHidden();
    const [client] = await db.select().from(table.oidcClient).where(eq(table.oidcClient.name, name));
    expect(client?.scopes).toEqual(expect.arrayContaining(["offline_access"]));
    expect(client?.scopes).not.toContain("profile");
    expect(client?.requireActiveMembership).toBe(true);

    await openDialog();
    await expectDefaults();
  });
});
