import { marked } from "marked";

export function renderMarkdown(markdown: string | null | undefined): string {
  return marked(markdown ?? "", {
    async: false,
    breaks: true,
    gfm: true,
  });
}
