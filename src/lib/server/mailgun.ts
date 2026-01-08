import Mailgun from "mailgun.js";
import type { MessagesSendResult } from "mailgun.js/definitions";
import { env } from "$lib/server/env";
import { logger } from "$lib/server/telemetry";

interface SendEmailOptions {
	to: string;
	subject: string;
	text: string;
}

export const sendEmail = async (options: SendEmailOptions): Promise<MessagesSendResult> => {
	if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN || !env.MAILGUN_SENDER) {
		throw new Error("Mailgun is not properly configured.");
	}
	const mailgun = new Mailgun(FormData);

	const mg = mailgun.client({
		username: "api",
		key: env.MAILGUN_API_KEY,
		url: env.MAILGUN_URL,
	});

	return await mg.messages.create(env.MAILGUN_DOMAIN, {
		from: env.MAILGUN_SENDER,
		to: options.to,
		subject: options.subject,
		text: options.text,
	});
};

/**
 * Health check for Mailgun connectivity
 * Returns status: "ok" | "not_configured" | "error"
 * - In dev mode, CI, or when Mailgun isn't configured: returns "not_configured" (doesn't fail health check)
 * - In production with Mailgun configured: validates connectivity and returns "ok" or "error"
 * Errors are logged server-side only and not exposed to clients
 */
export const checkMailgunHealth = async (): Promise<"ok" | "not_configured" | "error"> => {
	// If running in CI or Mailgun is not configured (dev or missing credentials), skip validation
	if (env.CI || !env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN || !env.MAILGUN_SENDER) {
		return "not_configured";
	}

	try {
		const mailgun = new Mailgun(FormData);
		const mg = mailgun.client({
			username: "api",
			key: env.MAILGUN_API_KEY,
			url: env.MAILGUN_URL,
		});

		// Verify domain exists and is accessible
		// This is a lightweight check that doesn't send emails
		await mg.domains.get(env.MAILGUN_DOMAIN);

		return "ok";
	} catch (error) {
		logger.error("mailgun.health_check_failed", error);
		return "error";
	}
};
