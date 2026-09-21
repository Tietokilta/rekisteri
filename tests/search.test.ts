import { describe, expect, it } from "vitest";
import { matchesSearchTokens } from "$lib/utils";

describe("matchesSearchTokens", () => {
  const person = ["first.middle@example.org", "First Middle", "Last", "Espoo"];

  it("matches tokens across different fields", () => {
    expect(matchesSearchTokens("First Last", person)).toBe(true);
    expect(matchesSearchTokens("Last First", person)).toBe(true);
    expect(matchesSearchTokens("Middle Espoo", person)).toBe(true);
  });

  it("requires every token to match", () => {
    expect(matchesSearchTokens("First Missing", person)).toBe(false);
  });

  it("is case insensitive and matches partial tokens", () => {
    expect(matchesSearchTokens("fir las", person)).toBe(true);
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(matchesSearchTokens("  First   Last  ", person)).toBe(true);
  });

  it("matches everything for an empty query", () => {
    expect(matchesSearchTokens("", person)).toBe(true);
    expect(matchesSearchTokens(" ".repeat(3), person)).toBe(true);
  });

  it("skips null and undefined fields", () => {
    expect(matchesSearchTokens("last", [null, undefined, "Last"])).toBe(true);
    expect(matchesSearchTokens("last", [null, undefined])).toBe(false);
  });

  it("does not let a single token span a field boundary", () => {
    expect(matchesSearchTokens("middlelast", person)).toBe(false);
  });
});
