import * as privateEnv from "$app/env/private";
import { publicEnv } from "#lib/env.js";
import { dev, building } from "$app/env";

/**
 * Validated and type-safe environment variables (both public and private).
 * SvelteKit validates each variable against its schema in src/env.ts; the checks below span several.
 * Use this instead of importing from $app/env/private or $app/env/public directly.
 * Only importable in server code.
 *
 * @example
 * import { env } from "#lib/server/env.js";
 * const stripe = new Stripe(env.STRIPE_API_KEY); // Type-safe!
 * const url = env.PUBLIC_URL; // Also includes public env vars
 */
export const env = { ...publicEnv, ...privateEnv };

const issues: string[] = [];

// In production, SMTP is required
if (
  !dev &&
  env.NODE_ENV === "production" &&
  [env.SMTP_HOST, env.SMTP_PORT, env.SMTP_USER, env.SMTP_PASS, env.SMTP_FROM].includes(undefined)
) {
  issues.push("SMTP configuration (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM) is required in production");
}

// With OIDC enabled in production, PUBLIC_URL (the issuer) must use https, except for
// localhost/127.0.0.1 or during build time.
if (
  env.OIDC_ENABLED &&
  !dev &&
  !building &&
  !env.TEST &&
  env.NODE_ENV === "production" &&
  !env.PUBLIC_URL.startsWith("http://localhost") &&
  !env.PUBLIC_URL.startsWith("http://127.0.0.1") &&
  !env.PUBLIC_URL.startsWith("https://")
) {
  issues.push("PUBLIC_URL must use https when OIDC is enabled in production");
}

// Fail fast at module load
if (issues.length > 0) {
  console.error("❌ Invalid environment variables:");
  for (const issue of issues) console.error(`- ${issue}`);
  throw new Error("Environment validation failed. Check the errors above.");
}
