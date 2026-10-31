import { describe, expect, it } from "vitest";
import { resolveNext, withNext } from "#lib/utils/next.js";

describe("resolveNext", () => {
  it("re-applies the current locale", () => {
    expect(resolveNext("/en/new", "fi")).toBe("/fi/new");
    expect(resolveNext("/fi/settings/profile", "en")).toBe("/en/settings/profile");
  });

  it("adds a locale to locale-less paths", () => {
    expect(resolveNext("/new", "fi")).toBe("/fi/new");
  });

  it("maps the root path to the locale root", () => {
    expect(resolveNext("/en", "fi")).toBe("/fi");
    expect(resolveNext("/", "en")).toBe("/en");
  });

  it("keeps the query string and hash", () => {
    expect(resolveNext("/en/settings/emails?next=%2Fen%2Fnew#add", "fi")).toBe(
      "/fi/settings/emails?next=%2Fen%2Fnew#add",
    );
  });

  it("rejects missing values", () => {
    expect(resolveNext(null, "fi")).toBeNull();
    expect(resolveNext(undefined, "fi")).toBeNull();
    expect(resolveNext("", "fi")).toBeNull();
  });

  it("rejects off-site and non-path values", () => {
    for (const value of [
      "https://evil.example/fi",
      "//evil.example/fi",
      String.raw`/\evil.example`,
      "javascript:alert(1)",
      "fi/new",
    ]) {
      expect(resolveNext(value, "fi"), value).toBeNull();
    }
  });
});

describe("withNext", () => {
  it("encodes the target", () => {
    expect(withNext("/fi/settings/profile", "/fi/new?a=1")).toBe("/fi/settings/profile?next=%2Ffi%2Fnew%3Fa%3D1");
  });
});
