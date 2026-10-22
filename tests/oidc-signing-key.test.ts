import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { calculateRfc7638Thumbprint, parseBase64Jwk, getOrCreateJwk } from "../src/lib/server/oidc/provider";
import { env } from "../src/lib/server/env";

describe("OIDC Issuer Signing Key Persistence", () => {
  const globalOidc = globalThis as unknown as { __oidcJwk?: Record<string, unknown> };
  let originalCachedJwk: Record<string, unknown> | undefined;
  let originalEnvJwk: string | undefined;

  beforeEach(() => {
    originalCachedJwk = globalOidc.__oidcJwk;
    originalEnvJwk = env.OIDC_SIGNING_KEY_JWK;
  });

  afterEach(() => {
    globalOidc.__oidcJwk = originalCachedJwk;
    (env as Record<string, unknown>).OIDC_SIGNING_KEY_JWK = originalEnvJwk;
  });

  it("computes deterministic RFC 7638 SHA-256 thumbprints for RSA keys", () => {
    const testJwk = {
      kty: "RSA",
      n: "u12345sample_modulus",
      e: "AQAB",
    };
    const thumbprint1 = calculateRfc7638Thumbprint(testJwk);
    const thumbprint2 = calculateRfc7638Thumbprint(testJwk);

    expect(thumbprint1).toBe(thumbprint2);
    expect(typeof thumbprint1).toBe("string");
    expect(thumbprint1.length).toBeGreaterThan(10);
  });

  it("parses Base64-encoded JSON JWK strings correctly", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = privateKey.export({ format: "jwk" }) as Record<string, unknown>;
    const base64Jwk = Buffer.from(JSON.stringify(jwk)).toString("base64");

    const parsed = parseBase64Jwk(base64Jwk);
    expect(parsed).not.toBeNull();
    expect(parsed?.kty).toBe("RSA");
    expect(parsed?.n).toBe(jwk.n);
    expect(parsed?.e).toBe("AQAB");
  });

  it("strictly rejects raw JSON strings (Base64 is the only supported format)", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = privateKey.export({ format: "jwk" }) as Record<string, unknown>;
    const rawJson = JSON.stringify(jwk);

    const parsed = parseBase64Jwk(rawJson);
    expect(parsed).toBeNull();
  });

  it("rejects invalid, malformed, or empty inputs", () => {
    expect(parseBase64Jwk("")).toBeNull();
    expect(parseBase64Jwk(" ".repeat(3))).toBeNull();
    expect(parseBase64Jwk("not-valid-base64-json")).toBeNull();

    // Base64-encoded plain text that is not JSON
    const notJson = Buffer.from("plain text string").toString("base64");
    expect(parseBase64Jwk(notJson)).toBeNull();

    // Base64-encoded JSON without 'kty'
    const invalidObj = Buffer.from(JSON.stringify({ someKey: "value" })).toString("base64");
    expect(parseBase64Jwk(invalidObj)).toBeNull();
  });

  it("uses the key's RFC 7638 thumbprint as its kid when loaded from Base64 JWK", () => {
    delete globalOidc.__oidcJwk;
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = privateKey.export({ format: "jwk" }) as Record<string, unknown>;
    const expectedThumbprint = calculateRfc7638Thumbprint(jwk);
    const base64Jwk = Buffer.from(JSON.stringify(jwk)).toString("base64");

    (env as Record<string, unknown>).OIDC_SIGNING_KEY_JWK = base64Jwk;

    const loadedKey = getOrCreateJwk();
    expect(loadedKey).toBeDefined();
    expect(loadedKey.kid).toBe(expectedThumbprint);
    expect(loadedKey.use).toBe("sig");
    expect(loadedKey.alg).toBe("RS256");
  });

  it("generates an ephemeral random key with UUID kid in memory when no key is set", () => {
    delete globalOidc.__oidcJwk;
    (env as Record<string, unknown>).OIDC_SIGNING_KEY_JWK = undefined;

    const ephemeralKey = getOrCreateJwk();
    expect(ephemeralKey).toBeDefined();
    expect(ephemeralKey.kty).toBe("RSA");
    expect(ephemeralKey.use).toBe("sig");
    expect(ephemeralKey.alg).toBe("RS256");
    // Verifies UUID v4 format from previous randomUUID method
    expect(ephemeralKey.kid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
