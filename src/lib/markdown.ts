import snarkdown from "snarkdown";

function escapeHtml(markdown: string): string {
  return markdown
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Render Markdown while treating raw HTML in the source as text.
 * This is not a full HTML sanitizer; it only prevents raw HTML from being passed through snarkdown.
 */
export function renderMarkdown(markdown: string | null | undefined): string {
  return snarkdown(escapeHtml(markdown ?? ""));
}
