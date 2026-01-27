import { env } from "$lib/server/env";

interface SendMessageOptions {
	message: string;
	parseMode?: "HTML" | "Markdown" | "MarkdownV2";
}

/**
 * Send a message to the configured Telegram chat via bot API.
 * Returns true if successful, false otherwise.
 */
export async function sendTelegramMessage(options: SendMessageOptions): Promise<boolean> {
	if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
		console.warn("[Telegram] Not configured, skipping message send");
		return false;
	}

	try {
		const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				chat_id: env.TELEGRAM_CHAT_ID,
				text: options.message,
				parse_mode: options.parseMode,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			console.error("[Telegram] Failed to send message:", error);
			return false;
		}

		return true;
	} catch (error) {
		console.error("[Telegram] Error sending message:", error);
		return false;
	}
}

/**
 * Escape special characters for Telegram MarkdownV2 format.
 */
export function escapeMarkdownV2(text: string): string {
	return text.replaceAll(/[_*[\]()~`>#+\-=|{}.!\\]/g, String.raw`\$&`);
}

/**
 * Health check for Telegram bot connectivity.
 */
export async function checkTelegramHealth(): Promise<"ok" | "not_configured" | "error"> {
	if (env.CI || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
		return "not_configured";
	}

	try {
		const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`;
		const response = await fetch(url);

		if (!response.ok) {
			console.error("[Telegram] Health check failed:", await response.text());
			return "error";
		}

		return "ok";
	} catch (error) {
		console.error("[Telegram] Health check error:", error);
		return "error";
	}
}
