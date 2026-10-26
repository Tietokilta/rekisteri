import { describe, it, expect } from "vitest";
import type { Cookies } from "@sveltejs/kit";
import { rememberReturnTo, takeReturnTo } from "../src/lib/server/oidc/return-to";

function cookieJar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    cookies: {
      get: (name: string) => values.get(name),
      set: (name: string, value: string) => void values.set(name, value),
      delete: (name: string) => void values.delete(name),
    } as unknown as Cookies,
  };
}

describe("OIDC returnTo cookie", () => {
  const origin = "https://rekisteri.example";

  it("remembers only an OIDC login page on this site", () => {
    const jar = cookieJar();
    rememberReturnTo(jar.cookies, `${origin}/oidc/login/abc-123_x`, origin);
    expect(jar.values.get("returnTo")).toBe("/oidc/login/abc-123_x");

    for (const referer of [`${origin}/fi/settings`, "https://evil.example/oidc/login/abc", null, "not a url"]) {
      rememberReturnTo(jar.cookies, referer, origin);
      expect(jar.values.has("returnTo")).toBe(false);
    }
  });

  it("forgets an earlier login page when a normal sign-in starts", () => {
    const jar = cookieJar({ returnTo: "/oidc/login/old" });
    rememberReturnTo(jar.cookies, `${origin}/fi/sign-in`, origin);
    expect(takeReturnTo(jar.cookies)).toBeUndefined();
  });

  it("returns and clears a valid value, and never returns anything else", () => {
    expect(takeReturnTo(cookieJar({ returnTo: "/oidc/login/abc" }).cookies)).toBe("/oidc/login/abc");
    for (const planted of ["https://evil.example", "//evil.example/oidc/login/abc", "/fi/admin", "/oidc/login/a/b"]) {
      const jar = cookieJar({ returnTo: planted });
      expect(takeReturnTo(jar.cookies)).toBeUndefined();
      expect(jar.values.has("returnTo")).toBe(false);
    }
  });
});
