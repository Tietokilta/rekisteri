import crypto from "node:crypto";
import { expect } from "vitest";

export function generatePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function catchRedirect(e: unknown): string {
  const err = e as { status?: number; location?: string };
  if (err.status === 303 || err.status === 302) {
    return err.location || "";
  }
  throw e;
}

export function expectNoAccessToken(tokenData: Record<string, unknown>) {
  expect(tokenData.access_token).toBeUndefined();
  expect(tokenData.token_type).toBeUndefined();
  expect(tokenData.id_token).toBeDefined();
}
