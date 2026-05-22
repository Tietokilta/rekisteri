import { env } from "$lib/server/env";
import { dev } from "$app/environment";
import { sendMailgunEmail, checkMailgunHealth } from "./mailgun";
import { sendSmtpEmail, checkSmtpHealth } from "./smtp";
import type { SendEmailOptions, SendEmailResult } from "./types";

export const sendEmail = async (options: SendEmailOptions): Promise<SendEmailResult> => {
  // In dev or test mode, log email instead of sending
  if (dev || env.TEST) {
    const mode = dev ? "dev" : "test";
    console.log(`[Email] Email (${mode} mode) using ${env.EMAIL_PROVIDER}:`, {
      to: options.to,
      subject: options.subject,
      headers: options.headers,
      text: options.text,
    });
    // Return a mock success response
    return {
      status: 200,
      id: `<mock-${Date.now()}@${env.EMAIL_PROVIDER}.test>`,
      message: "Queued. Thank you.",
    };
  }

  if (env.EMAIL_PROVIDER === "mailgun") {
    const result = await sendMailgunEmail(options);
    return {
      status: result.status,
      id: result.id ?? "",
      message: result.message ?? "",
    };
  } else if (env.EMAIL_PROVIDER === "smtp") {
    return await sendSmtpEmail(options);
  } else {
    throw new Error(`Unsupported email provider: ${env.EMAIL_PROVIDER}`);
  }
};

/**
 * Health check for the configured email service
 * Returns status: "ok" | "not_configured" | "error"
 */
export const checkEmailHealth = async (): Promise<"ok" | "not_configured" | "error"> => {
  if (env.EMAIL_PROVIDER === "mailgun") {
    return await checkMailgunHealth();
  } else if (env.EMAIL_PROVIDER === "smtp") {
    return await checkSmtpHealth();
  } else {
    return "not_configured";
  }
};
