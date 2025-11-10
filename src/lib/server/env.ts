import { env as privateEnv } from "$env/dynamic/private";
import { env as publicEnv } from "$lib/env";
import { dev } from "$app/environment";
import { z } from "zod";

/**
 * Private environment variable validation schema using Zod.
 * Validates all server-only environment variables at server startup.
 * If validation fails, the server will not start and will log detailed errors.
 */
const privateEnvSchema = z
	.object({
		// Node environment
		NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
		// CI environment (automatically set by most CI systems like GitHub Actions)
		CI: z.stringbool().optional().default(false),

		// Database
		DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

		// Stripe (required)
		STRIPE_API_KEY: z
			.string()
			.min(1, "STRIPE_API_KEY is required")
			.refine((val) => val.startsWith("sk_"), {
				message: "STRIPE_API_KEY must start with 'sk_'",
			}),
		STRIPE_WEBHOOK_SECRET: z
			.string()
			.min(1, "STRIPE_WEBHOOK_SECRET is required")
			.refine((val) => val.startsWith("whsec_"), {
				message: "STRIPE_WEBHOOK_SECRET must start with 'whsec_'",
			}),

		// Mailgun (optional in dev, required in production)
		// Empty strings are treated as undefined for optional fields
		MAILGUN_API_KEY: z
			.string()
			.min(1)
			.optional()
			.or(z.literal("").transform((): undefined => undefined)),
		MAILGUN_DOMAIN: z
			.string()
			.min(1)
			.optional()
			.or(z.literal("").transform((): undefined => undefined)),
		// MAILGUN_SENDER: accepts any string, Mailgun will validate the format
		// Can be "email@domain.com" or "Name <email@domain.com>"
		MAILGUN_SENDER: z
			.string()
			.min(1)
			.optional()
			.or(z.literal("").transform((): undefined => undefined)),
		MAILGUN_URL: z
			.url()
			.optional()
			.or(z.literal("").transform((): undefined => undefined)),

		// Server configuration
		PORT: z.coerce.number().int().positive().default(5173),
		ADDRESS_HEADER: z.string().default("X-Client-IP"),

		// Passkey/WebAuthn Configuration
		RP_NAME: z.string().min(1),
		RP_ID: z.string().min(1),
		RP_ORIGIN: z.url({ protocol: /^https?$/ }),
	})
	.superRefine((data, ctx) => {
		// In production, Mailgun is required
		if (!dev && data.NODE_ENV === "production") {
			if (!data.MAILGUN_API_KEY) {
				ctx.addIssue({
					code: "custom",
					path: ["MAILGUN_API_KEY"],
					message: "MAILGUN_API_KEY is required in production",
				});
			}
			if (!data.MAILGUN_DOMAIN) {
				ctx.addIssue({
					code: "custom",
					path: ["MAILGUN_DOMAIN"],
					message: "MAILGUN_DOMAIN is required in production",
				});
			}
			if (!data.MAILGUN_SENDER) {
				ctx.addIssue({
					code: "custom",
					path: ["MAILGUN_SENDER"],
					message: "MAILGUN_SENDER is required in production",
				});
			}
			if (!data.MAILGUN_URL) {
				ctx.addIssue({
					code: "custom",
					path: ["MAILGUN_URL"],
					message: "MAILGUN_URL is required in production",
				});
			}
		}
	});

// Validate private environment variables at module load (fail fast)
const parsed = privateEnvSchema.safeParse({
	NODE_ENV: privateEnv.NODE_ENV,
	CI: privateEnv.CI,
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
	console.error(JSON.stringify(z.treeifyError(parsed.error), null, 2));
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
export const env = { ...publicEnv, ...parsed.data };

/**
 * Type definition for validated environment variables (public + private)
 */
export type Env = typeof publicEnv & z.infer<typeof privateEnvSchema>;
