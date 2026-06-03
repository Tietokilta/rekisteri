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

  it("preserves explicit line breaks without doubling them", () => {
    const html = renderMarkdown("First line<br />\nSecond line");

    expect(html).toContain("First line<br />\nSecond line");
    expect(html).not.toContain("<br /><br>");
    expect(html).not.toContain("<br />\n<br>");
  });
});
