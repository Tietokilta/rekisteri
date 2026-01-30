import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import * as v from "valibot";
import { sendTelegramMessage, escapeMarkdownV2 } from "$lib/server/telegram";
import { env } from "$lib/server/env";
import { RefillingTokenBucket } from "$lib/server/auth/rate-limit";

const feedbackSchema = v.object({
	message: v.pipe(v.string(), v.minLength(1, "Message is required"), v.maxLength(2000, "Message too long")),
	pageUrl: v.optional(v.pipe(v.string(), v.maxLength(500))),
	errorCode: v.optional(v.pipe(v.string(), v.maxLength(10))),
	userAgent: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

// Rate limit: 5 feedback submissions per hour per IP
const ipBucket = new RefillingTokenBucket<string>(5, 60 * 60);

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const clientIP = getClientAddress();

	// Check rate limit (skip if disabled for tests)
	if (!env.UNSAFE_DISABLE_RATE_LIMITS && !ipBucket.consume(clientIP, 1)) {
		error(429, "Too many feedback submissions. Please try again later.");
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, "Invalid JSON body");
	}

	const parsed = v.safeParse(feedbackSchema, body);
	if (!parsed.success) {
		error(400, "Invalid feedback data");
	}

	const { message, pageUrl, errorCode, userAgent } = parsed.output;

	// Build Telegram message
	const userInfo = locals.user ? `${locals.user.email} (${locals.user.id})` : "Anonymous";

	const lines = [
		"📣 *New Feedback Report*",
		"",
		`*From:* ${escapeMarkdownV2(userInfo)}`,
		`*IP:* ${escapeMarkdownV2(clientIP)}`,
	];

	if (pageUrl) {
		lines.push(`*Page:* ${escapeMarkdownV2(pageUrl)}`);
	}

	if (errorCode) {
		lines.push(`*Error Code:* ${escapeMarkdownV2(errorCode)}`);
	}

	if (userAgent) {
		// Truncate user agent if too long
		const truncatedUA = userAgent.length > 100 ? userAgent.slice(0, 100) + "..." : userAgent;
		lines.push(`*User Agent:* ${escapeMarkdownV2(truncatedUA)}`);
	}

	lines.push("", "*Message:*", escapeMarkdownV2(message));

	const telegramMessage = lines.join("\n");

	const sent = await sendTelegramMessage({
		message: telegramMessage,
		parseMode: "MarkdownV2",
	});

	if (!sent) {
		// Log the feedback anyway even if Telegram fails
		console.log("[Feedback] Received feedback (Telegram not configured or failed):", {
			user: userInfo,
			ip: clientIP,
			pageUrl,
			errorCode,
			message,
		});
	}

	return json({ success: true });
};
