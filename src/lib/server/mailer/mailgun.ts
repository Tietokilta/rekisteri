import Mailgun from "mailgun.js";
import type { MessagesSendResult, MailgunMessageData } from "mailgun.js/definitions";
import { env } from "$lib/server/env";
import type { SendEmailOptions } from "./types";

export const sendMailgunEmail = async (options: SendEmailOptions): Promise<MessagesSendResult> => {
  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN || !env.MAILGUN_SENDER) {
    throw new Error("Mailgun is not properly configured.");
  }

  const mailgun = new Mailgun(FormData);

  const mg = mailgun.client({
    username: "api",
    key: env.MAILGUN_API_KEY,
    url: env.MAILGUN_URL,
  });

  const message: MailgunMessageData = {
    from: env.MAILGUN_SENDER,
    to: options.to,
    subject: options.subject,
    text: options.text,
    ...(options.html && { html: options.html }),
    // Add custom headers with 'h:' prefix (e.g., for OTP auto-extraction)
    ...(options.headers &&
      Object.fromEntries(Object.entries(options.headers).map(([key, value]) => [`h:${key}`, value]))),
  };

  return await mg.messages.create(env.MAILGUN_DOMAIN, message);
};

export const checkMailgunHealth = async (): Promise<"ok" | "not_configured" | "error"> => {
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

    await mg.domains.get(env.MAILGUN_DOMAIN);

    return "ok";
  } catch (error) {
    console.error("[Health] Mailgun health check failed:", error);
    return "error";
  }
};
