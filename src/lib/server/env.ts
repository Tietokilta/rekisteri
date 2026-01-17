import { env as privateEnv } from "$env/dynamic/private";
import { env as publicEnv } from "$lib/env";
import { dev } from "$app/environment";
import * as v from "valibot";

/**
 * Schema for parsing booleanish environment variables.
 * Accepts: true, false, "true", "1", "yes", "on", "y", "enabled", "false", "0", "no", "off", "n", "disabled"
 * Transforms to boolean.
 */
const booleanish = v.pipe(
	v.union([
		v.boolean(),
		v.picklist(["true", "1", "yes", "on", "y", "enabled", "false", "0", "no", "off", "n", "disabled"]),
	]),
	v.transform((val) => {
		if (typeof val === "boolean") return val;
		return ["true", "1", "yes", "on", "y", "enabled"].includes(val.toLowerCase());
	}),
);

/**
 * Private environment variable validation schema using Valibot.
 * Validates all server-only environment variables at server startup.
 * If validation fails, the server will not start and will log detailed errors.
 */
const privateEnvSchema = v.pipe(
	v.object({
		// Node environment
		NODE_ENV: v.optional(v.picklist(["development", "production", "test"]), "development"),

		// CI environment (automatically set by most CI systems like GitHub Actions)
		CI: v.optional(booleanish, false),

		// Test mode (set when running e2e or integration tests)
		// This keeps NODE_ENV=production for accurate behavior while enabling test-specific features
		TEST: v.optional(booleanish, false),

		// UNSAFE: Disable rate limits for e2e tests (never set in production!)
		UNSAFE_DISABLE_RATE_LIMITS: v.optional(booleanish, false),

		// Database
		DATABASE_URL: v.pipe(
			v.string(),
			v.url(),
			v.regex(/^postgres(ql)?:\/\/.+/, "DATABASE_URL must use postgres or postgresql protocol"),
		),

		// Stripe (required)
		STRIPE_API_KEY: v.pipe(
			v.string(),
			v.minLength(1, "STRIPE_API_KEY is required"),
			v.startsWith("sk_", "STRIPE_API_KEY must start with 'sk_'"),
		),
		STRIPE_WEBHOOK_SECRET: v.pipe(
			v.string(),
			v.minLength(1, "STRIPE_WEBHOOK_SECRET is required"),
			v.startsWith("whsec_", "STRIPE_WEBHOOK_SECRET must start with 'whsec_'"),
		),

		// Mailgun (optional in dev, required in production)
		// Empty strings are treated as undefined for optional fields
		MAILGUN_API_KEY: v.optional(
			v.pipe(
				v.string(),
				v.transform((val) => (val === "" ? undefined : val)),
			),
		),
		MAILGUN_DOMAIN: v.optional(
			v.pipe(
				v.string(),
				v.transform((val) => (val === "" ? undefined : val)),
			),
		),
		// MAILGUN_SENDER: accepts any string, Mailgun will validate the format
		// Can be "email@domain.com" or "Name <email@domain.com>"
		MAILGUN_SENDER: v.optional(
			v.pipe(
				v.string(),
				v.transform((val) => (val === "" ? undefined : val)),
			),
		),
		MAILGUN_URL: v.optional(
			v.pipe(
				v.union([v.pipe(v.string(), v.url()), v.literal("")]),
				v.transform((val) => (val === "" ? undefined : val)),
			),
		),

		// Server configuration
		PORT: v.optional(
			v.pipe(v.union([v.number(), v.pipe(v.string(), v.transform(Number))]), v.number(), v.integer(), v.minValue(1)),
			5173,
		),
		ADDRESS_HEADER: v.optional(v.string(), "X-Client-IP"),

		// Passkey/WebAuthn Configuration
		RP_NAME: v.pipe(v.string(), v.minLength(1)),
		RP_ID: v.pipe(v.string(), v.minLength(1)),
		RP_ORIGIN: v.pipe(v.string(), v.url(), v.regex(/^https?:\/\/.+/, "RP_ORIGIN must use http or https protocol")),
	}),
	// In production, Mailgun is required
	v.check((data) => {
		if (!dev && data.NODE_ENV === "production") {
			return (
				data.MAILGUN_API_KEY !== undefined &&
				data.MAILGUN_DOMAIN !== undefined &&
				data.MAILGUN_SENDER !== undefined &&
				data.MAILGUN_URL !== undefined
			);
		}
		return true;
	}, "Mailgun configuration (MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_SENDER, MAILGUN_URL) is required in production"),
);

// Validate private environment variables at module load (fail fast)
const parsed = v.safeParse(privateEnvSchema, {
	NODE_ENV: privateEnv.NODE_ENV,
	CI: privateEnv.CI,
	TEST: privateEnv.TEST,
	UNSAFE_DISABLE_RATE_LIMITS: privateEnv.UNSAFE_DISABLE_RATE_LIMITS,
	DATABASE_URL: privateEnv.DATABASE_URL,
	STRIPE_API_KEY: privateEnv.STRIPE_API_KEY,
	STRIPE_WEBHOOK_SECRET: privateEnv.STRIPE_WEBHOOK_SECRET,
	MAILGUN_API_KEY: privateEnv.MAILGUN_API_KEY,
	MAILGUN_DOMAIN: privateEnv.MAILGUN_DOMAIN,
	MAILGUN_SENDER: privateEnv.MAILGUN_SENDER,
	MAILGUN_URL: privateEnv.MAILGUN_URL,
	PORT: privateEnv.PORT,
	ADDRESS_HEADER: privateEnv.ADDRESS_HEADER,
	RP_NAME: privateEnv.RP_NAME,
	RP_ID: privateEnv.RP_ID,
	RP_ORIGIN: privateEnv.RP_ORIGIN,
});

if (!parsed.success) {
	console.error("❌ Invalid private environment variables:");
	console.error(JSON.stringify(v.flatten(parsed.issues), null, 2));
	throw new Error("Private environment validation failed. Check the errors above.");
}

/**
 * Validated and type-safe environment variables (both public and private).
 * Use this instead of importing from $env/dynamic/private or $env/dynamic/public directly.
 * Only importable in server code.
 *
 * @example
 * import { env } from "$lib/server/env";
 * const stripe = new Stripe(env.STRIPE_API_KEY); // Type-safe!
 * const url = env.PUBLIC_URL; // Also includes public env vars
 */
export const env = { ...publicEnv, ...parsed.output };

/**
 * Type definition for validated environment variables (public + private)
 */
export type Env = typeof publicEnv & v.InferOutput<typeof privateEnvSchema>;
