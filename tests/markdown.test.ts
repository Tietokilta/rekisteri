import { describe, expect, it } from "vitest";
import { renderMarkdown } from "$lib/markdown";

describe("renderMarkdown", () => {
  it("renders GFM tables", () => {
    expect(
      renderMarkdown(`
| Name | Value |
| --- | --- |
| Email | privacy@example.org |
`),
    ).toContain("<table>");
  });

  it("renders line breaks", () => {
    expect(renderMarkdown("First line\nSecond line")).toContain("First line<br>Second line");
    expect(renderMarkdown("First line<br />Second line")).toContain("First line<br />Second line");
  });
});
