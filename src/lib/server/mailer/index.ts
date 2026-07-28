import { env } from "$lib/server/env";
import { dev } from "$app/environment";
import { sendSmtpEmail, checkSmtpHealth } from "./smtp";
import type { SendEmailOptions, SendEmailResult } from "./types";

export const sendEmail = async (options: SendEmailOptions): Promise<SendEmailResult> => {
  // In dev or test mode, log email instead of sending
  if (dev || env.TEST) {
    const mode = dev ? "dev" : "test";
    console.log(`[Email] Email (${mode} mode):`, {
      to: options.to,
      subject: options.subject,
      headers: options.headers,
      text: options.text,
    });
    // Return a mock success response
    return {
      status: 200,
      id: `<mock-${Date.now()}@smtp.test>`,
      message: "Queued. Thank you.",
    };
  }

  return await sendSmtpEmail(options);
};

/**
 * Health check for the configured email service
 * Returns status: "ok" | "not_configured" | "error"
 */
export const checkEmailHealth = async (): Promise<"ok" | "not_configured" | "error"> => {
  return await checkSmtpHealth();
};
