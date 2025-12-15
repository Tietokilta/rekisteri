import { env as publicEnv } from "$env/dynamic/public";
import { PUBLIC_GIT_COMMIT_SHA } from "$env/static/public";
import { z } from "zod";

/**
 * Public environment variable validation schema.
 * These variables are available on both client and server.
 */
const publicEnvSchema = z.object({
	// Public URL (required for Stripe redirects and other use cases)
	PUBLIC_URL: z.url({ protocol: /^https?$/ }),
	// Git commit SHA for version display (optional, baked in at build time)
	PUBLIC_GIT_COMMIT_SHA: z.string().optional(),
});

// Validate public environment variables at module load (fail fast)
const parsed = publicEnvSchema.safeParse({
	PUBLIC_URL: publicEnv.PUBLIC_URL,
	PUBLIC_GIT_COMMIT_SHA: PUBLIC_GIT_COMMIT_SHA || undefined,
});

if (!parsed.success) {
	console.error("❌ Invalid public environment variables:");
	console.error(JSON.stringify(z.treeifyError(parsed.error), null, 2));
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
export const env = parsed.data;

/**
 * Type definition for validated public environment variables
 */
export type PublicEnv = z.infer<typeof publicEnvSchema>;
