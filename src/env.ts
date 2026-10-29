import { defineEnvVars } from "@sveltejs/kit/env";
import * as v from "valibot";

/**
 * Environment variables, validated by SvelteKit when the server starts (and during `vite build`).
 * Import them through `#lib/env` and `#lib/server/env`, which add the checks spanning several variables.
 */

/**
 * Booleanish environment variable.
 * Accepts: "true", "1", "yes", "on", "y", "enabled", "false", "0", "no", "off", "n", "disabled"
 */
const booleanish = v.pipe(
  v.picklist(["true", "1", "yes", "on", "y", "enabled", "false", "0", "no", "off", "n", "disabled"]),
  v.transform((val) => ["true", "1", "yes", "on", "y", "enabled"].includes(val)),
);

/** Optional string where an empty value counts as unset */
const optionalString = v.optional(
  v.pipe(
    v.string(),
    v.transform((val) => (val === "" ? undefined : val)),
  ),
);

export const variables = defineEnvVars({
  // Public URL (required for Stripe redirects and other use cases)
  PUBLIC_URL: {
    public: true,
    schema: v.pipe(v.string(), v.url(), v.regex(/^https?:\/\/.+/, "PUBLIC_URL must use http or https protocol")),
  },
  // Git commit SHA for version display (optional, baked in at build time)
  PUBLIC_GIT_COMMIT_SHA: { public: true, static: true, schema: optionalString },

  // Node environment
  NODE_ENV: { schema: v.optional(v.picklist(["development", "production", "test"]), "development") },

  // CI environment (automatically set by most CI systems like GitHub Actions)
  CI: { schema: v.optional(booleanish, "false") },

  // Test mode (set when running e2e or integration tests)
  // This keeps NODE_ENV=production for accurate behavior while enabling test-specific features
  TEST: { schema: v.optional(booleanish, "false") },

  // UNSAFE: Disable rate limits for e2e tests (never set in production!)
  UNSAFE_DISABLE_RATE_LIMITS: { schema: v.optional(booleanish, "false") },

  // Database
  DATABASE_URL: {
    schema: v.pipe(
      v.string(),
      v.url(),
      v.regex(/^postgres(ql)?:\/\/.+/, "DATABASE_URL must use postgres or postgresql protocol"),
    ),
  },

  // Stripe (required)
  STRIPE_API_KEY: {
    schema: v.pipe(
      v.string(),
      v.minLength(1, "STRIPE_API_KEY is required"),
      v.startsWith("sk_", "STRIPE_API_KEY must start with 'sk_'"),
    ),
  },
  STRIPE_WEBHOOK_SECRET: {
    schema: v.pipe(
      v.string(),
      v.minLength(1, "STRIPE_WEBHOOK_SECRET is required"),
      v.startsWith("whsec_", "STRIPE_WEBHOOK_SECRET must start with 'whsec_'"),
    ),
  },
  // Alternative Stripe API endpoint, e.g. stripe-mock in e2e tests (unset in production)
  STRIPE_API_URL: { schema: v.pipe(optionalString, v.optional(v.pipe(v.string(), v.url()))) },

  // SMTP configuration (optional in dev, required in production, see #lib/server/env)
  SMTP_HOST: { schema: optionalString },
  SMTP_PORT: {
    schema: v.optional(
      v.pipe(
        v.string(),
        v.transform((val) => (val === "" ? undefined : Number(val))),
        v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
      ),
    ),
  },
  SMTP_USER: { schema: optionalString },
  SMTP_PASS: { schema: optionalString },
  SMTP_FROM: { schema: optionalString },

  // Server configuration
  PORT: {
    schema: v.optional(v.pipe(v.string(), v.transform(Number), v.number(), v.integer(), v.minValue(1)), "5173"),
  },
  ADDRESS_HEADER: { schema: v.optional(v.string(), "X-Client-IP") },

  // Passkey/WebAuthn Configuration
  RP_NAME: { schema: v.pipe(v.string(), v.minLength(1)) },
  RP_ID: { schema: v.pipe(v.string(), v.minLength(1)) },
  RP_ORIGIN: {
    schema: v.pipe(v.string(), v.url(), v.regex(/^https?:\/\/.+/, "RP_ORIGIN must use http or https protocol")),
  },

  // OIDC provider feature flag
  OIDC_ENABLED: { schema: v.optional(booleanish, "false") },
  // OIDC signing key override (optional)
  OIDC_SIGNING_KEY_JWK: { schema: v.optional(v.string()) },
  // Secrets for signing the OIDC provider's cookies, comma-separated (first signs, all verify)
  OIDC_COOKIE_KEYS: { schema: v.optional(v.string()) },
});
