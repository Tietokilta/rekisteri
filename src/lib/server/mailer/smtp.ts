import nodemailer from "nodemailer";
import { env } from "$lib/server/env";
import type { SendEmailOptions, SendEmailResult } from "./types";

const getTransporter = () => {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error("SMTP is not properly configured.");
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // true for port 465, false for other ports
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
};

export const sendSmtpEmail = async (options: SendEmailOptions): Promise<SendEmailResult> => {
  if (!env.SMTP_FROM) {
    throw new Error("SMTP_FROM is not configured.");
  }

  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from: env.SMTP_FROM,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    headers: options.headers,
  });

  return {
    status: 200,
    id: info.messageId,
    message: "Email sent successfully",
  };
};

export const checkSmtpHealth = async (): Promise<"ok" | "not_configured" | "error"> => {
  if (env.CI || !env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return "not_configured";
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    return "ok";
  } catch (error) {
    console.error("[Health] SMTP health check failed:", error);
    return "error";
  }
};
