import { describe, it, expect } from "vitest";
import { ALL_CLAIMS, OIDC_SCOPES, OPENID_CLAIMS, OPTIONAL_CLAIMS } from "../src/lib/shared/oidc";

// The scope and claim definitions in shared/oidc feed the provider's claims registry, the
// admin client form and the consent screen, so they have to agree with each other.

describe("OIDC scope definitions", () => {
  it("scope keys are unique", () => {
    const keys = OIDC_SCOPES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("claim keys are unique", () => {
    const keys = ALL_CLAIMS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every claim a scope lists is defined for that scope", () => {
    for (const scope of OIDC_SCOPES) {
      for (const claimKey of scope.claims) {
        const claim = ALL_CLAIMS.find((c) => c.key === claimKey);
        expect(claim, `${scope.key} lists undefined claim ${claimKey}`).toBeDefined();
        expect(claim?.scope).toBe(scope.key);
      }
    }
  });

  it("every defined claim belongs to a scope that lists it", () => {
    for (const claim of ALL_CLAIMS) {
      const scope = OIDC_SCOPES.find((s) => s.key === claim.scope);
      expect(scope, `claim ${claim.key} refers to unknown scope ${claim.scope}`).toBeDefined();
      expect(scope?.claims).toContain(claim.key);
    }
  });

  it("only the openid scope holds the mandatory claims", () => {
    for (const claim of OPENID_CLAIMS) expect(claim.scope).toBe("openid");
    for (const claim of OPTIONAL_CLAIMS) expect(claim.scope).not.toBe("openid");
  });

  it("every scope has a title in both languages and an icon", () => {
    for (const scope of OIDC_SCOPES) {
      expect(scope.title.fi).toBeTruthy();
      expect(scope.title.en).toBeTruthy();
      expect(scope.icon).toBeTruthy();
    }
  });
});

describe("access scope", () => {
  const access = OIDC_SCOPES.find((s) => s.key === "access");

  it("is defined with the Lock icon", () => {
    expect(access).toBeDefined();
    expect(access?.icon).toBe("Lock");
  });

  it("grants exactly the admin_role claim", () => {
    expect(access?.claims).toEqual(["admin_role"]);
    const claim = OPTIONAL_CLAIMS.find((c) => c.key === "admin_role");
    expect(claim?.scope).toBe("access");
    expect(claim?.title.fi).toBeTruthy();
    expect(claim?.title.en).toBeTruthy();
  });
});
