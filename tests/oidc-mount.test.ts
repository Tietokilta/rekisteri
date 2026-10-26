import { describe, it, expect } from "vitest";
import { isOidcPath } from "../src/oidc-mount";
import { hashClientSecret, verifyClientSecret } from "../src/lib/server/oidc/secret";

describe("OIDC mount", () => {
  it("routes only the protocol endpoints to the provider", () => {
    expect(isOidcPath("/.well-known/openid-configuration")).toBe(true);
    expect(isOidcPath("/oidc/token")).toBe(true);
    expect(isOidcPath("/oidc/authorize/abc?x=1")).toBe(true);
    expect(isOidcPath("/oidc/login/abc")).toBe(false);
    expect(isOidcPath("/oidc/tokenish")).toBe(false);
    expect(isOidcPath("/fi/sign-in")).toBe(false);
  });

  it("doesn't throw on request targets that aren't valid URLs", () => {
    // Node's HTTP parser accepts these, and an exception here would crash the server
    for (const target of ["//[/", "http://[/", undefined]) expect(() => isOidcPath(target)).not.toThrow();
  });
});

describe("OIDC client secrets", () => {
  it("accepts only the matching secret against a scrypt hash", async () => {
    const stored = hashClientSecret("sec_right");
    expect(await verifyClientSecret("sec_right", stored)).toBe(true);
    expect(await verifyClientSecret("sec_wrong", stored)).toBe(false);
  });

  it("rejects secrets stored in plain text", async () => {
    expect(await verifyClientSecret("sec_plain", "sec_plain")).toBe(false);
  });
});
