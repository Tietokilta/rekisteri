import { env as publicEnv } from "$env/dynamic/public";
// PUBLIC_GIT_COMMIT_SHA is set via dynamic import
import * as v from "valibot";

/**
 * Public environment variable validation schema.
 * These variables are available on both client and server.
 */
const publicEnvSchema = v.object({
  // Public URL (required for Stripe redirects and other use cases)
  PUBLIC_URL: v.pipe(v.string(), v.url(), v.regex(/^https?:\/\/.+/, "PUBLIC_URL must use http or https protocol")),
  // Git commit SHA for version display (optional, baked in at build time via $env/static/public)
  PUBLIC_GIT_COMMIT_SHA: v.optional(v.string()),
});

// Validate public environment variables at module load (fail fast)
const parsed = v.safeParse(publicEnvSchema, {
  PUBLIC_URL: publicEnv.PUBLIC_URL,
  PUBLIC_GIT_COMMIT_SHA: publicEnv.PUBLIC_GIT_COMMIT_SHA || undefined,
});

if (!parsed.success) {
  console.error("❌ Invalid public environment variables:");
  console.error(JSON.stringify(v.flatten(parsed.issues), null, 2));
  throw new Error("Public environment validation failed. Check the errors above.");
}

/**
 * Validated and type-safe public environment variables.
 * Use this instead of importing from $env/dynamic/public directly.
 * Can be imported on both client and server.
 *
 * @example
 * import { env } from "$lib/env";
 * const redirectUrl = `${env.PUBLIC_URL}/callback`;
 */
export const env = parsed.output;

/**
 * Type definition for validated public environment variables
 */
export type PublicEnv = v.InferOutput<typeof publicEnvSchema>;
