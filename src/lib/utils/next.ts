import { stripLocaleFromPathname, type Locale } from "$lib/i18n/routing";

const BASE = "http://localhost";

/**
 * Resolve a `next` redirect target for the given locale.
 *
 * Only same-origin relative paths are accepted (no `//host` or absolute URLs),
 * so this is safe against open redirects. The locale prefix is replaced with
 * the current one, and the query string and hash are kept.
 *
 * Returns null if `next` is missing or not a safe relative path.
 */
export function resolveNext(next: string | null | undefined, locale: Locale): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) {
    return null;
  }

  const path = stripLocaleFromPathname(url.pathname);
  return `/${locale}${path === "/" ? "" : path}${url.search}${url.hash}`;
}

/** Append a `next` query parameter to an href. */
export function withNext(href: string, next: string): string {
  return `${href}?next=${encodeURIComponent(next)}`;
}
