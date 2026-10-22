import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { calculateRfc7638Thumbprint, parseSigningKeys, getSigningKeys } from "../src/lib/server/oidc/provider";
import { env } from "../src/lib/server/env";

// Run as a built server, so NODE_ENV and TEST decide whether a key is required
vi.mock("$app/environment", () => ({ dev: false, building: false, browser: false, version: "test" }));

function newJwk() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ format: "jwk" }) as Record<string, unknown>;
}

const toBase64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

describe("OIDC signing keys", () => {
  const globalOidc = globalThis as unknown as { __oidcJwks?: Record<string, unknown>[] };
  const mutableEnv = env as Record<string, unknown>;
  let originalCachedKeys: Record<string, unknown>[] | undefined;
  let originalEnv: Record<string, unknown>;

  beforeEach(() => {
    originalCachedKeys = globalOidc.__oidcJwks;
    originalEnv = { ...mutableEnv };
    delete globalOidc.__oidcJwks;
  });

  afterEach(() => {
    globalOidc.__oidcJwks = originalCachedKeys;
    Object.assign(mutableEnv, originalEnv);
  });

  it("computes deterministic RFC 7638 SHA-256 thumbprints for RSA keys", () => {
    const testJwk = { kty: "RSA", n: "u12345sample_modulus", e: "AQAB" };
    const thumbprint = calculateRfc7638Thumbprint(testJwk);
    expect(calculateRfc7638Thumbprint(testJwk)).toBe(thumbprint);
    expect(thumbprint.length).toBeGreaterThan(10);
  });

  it("parses a single Base64-encoded JWK", () => {
    const jwk = newJwk();
    const keys = parseSigningKeys(toBase64(jwk));
    expect(keys).toHaveLength(1);
    expect(keys?.[0]?.n).toBe(jwk.n);
  });

  it("parses a Base64-encoded JWK Set in order", () => {
    const [first, second] = [newJwk(), newJwk()];
    const keys = parseSigningKeys(toBase64({ keys: [first, second] }));
    expect(keys?.map((key) => key.n)).toEqual([first.n, second.n]);
  });

  it("rejects raw JSON, malformed input and objects that aren't keys", () => {
    expect(parseSigningKeys(JSON.stringify(newJwk()))).toBeNull();
    expect(parseSigningKeys("")).toBeNull();
    expect(parseSigningKeys(" ".repeat(3))).toBeNull();
    expect(parseSigningKeys("not-valid-base64-json")).toBeNull();
    expect(parseSigningKeys(Buffer.from("plain text string").toString("base64"))).toBeNull();
    expect(parseSigningKeys(toBase64({ someKey: "value" }))).toBeNull();
    expect(parseSigningKeys(toBase64({ keys: [] }))).toBeNull();
    expect(parseSigningKeys(toBase64({ keys: [newJwk(), { someKey: "value" }] }))).toBeNull();
  });

  it("loads configured keys with thumbprint kids and signing defaults, first key first", () => {
    const [current, previous] = [newJwk(), newJwk()];
    mutableEnv.OIDC_SIGNING_KEY_JWK = toBase64({ keys: [current, previous] });

    const keys = getSigningKeys();
    expect(keys.map((key) => key.kid)).toEqual([
      calculateRfc7638Thumbprint(current),
      calculateRfc7638Thumbprint(previous),
    ]);
    expect(keys.every((key) => key.use === "sig" && key.alg === "RS256")).toBe(true);
  });

  it("fails instead of falling back when the configured key is invalid", () => {
    mutableEnv.OIDC_SIGNING_KEY_JWK = "not-a-key";
    expect(() => getSigningKeys()).toThrow(/not a Base64-encoded JWK/);
  });

  it("generates a throwaway key outside production when none is configured", () => {
    mutableEnv.OIDC_SIGNING_KEY_JWK = undefined;
    const keys = getSigningKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]?.kty).toBe("RSA");
    expect(keys[0]?.kid).toBe(calculateRfc7638Thumbprint(keys[0] ?? {}));
  });

  it("requires a configured key in production", () => {
    Object.assign(mutableEnv, { OIDC_SIGNING_KEY_JWK: undefined, NODE_ENV: "production", TEST: false });
    expect(() => getSigningKeys()).toThrow(/required in production/);
  });
});
