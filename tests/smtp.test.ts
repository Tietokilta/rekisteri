import { describe, expect, it, vi } from "vitest";

const smtp = vi.hoisted(() => {
  const sendMail = vi.fn(async (_message: unknown) => ({
    messageId: "test-message-id",
  }));
  const verify = vi.fn(async () => true);
  const createTransport = vi.fn(() => ({ sendMail, verify }));

  return { createTransport, sendMail };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: smtp.createTransport,
  },
}));

vi.mock("$lib/server/env", () => ({
  env: {
    CI: false,
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: 587,
    SMTP_USER: "user@example.com",
    SMTP_PASS: "password",
    SMTP_FROM: "Sender <sender@example.com>",
  },
}));

import { sendSmtpEmail } from "$lib/server/mailer/smtp";

describe("SMTP mailer", () => {
  it("queues concurrent sends through one TLS-required connection pool", async () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      to: `recipient-${index}@example.com`,
      subject: `Message ${index}`,
      text: "Test message",
    }));

    await Promise.all(messages.map((message) => sendSmtpEmail(message)));

    expect(smtp.createTransport).toHaveBeenCalledOnce();
    expect(smtp.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        pool: true,
        maxConnections: 1,
        secure: false,
        requireTLS: true,
      }),
    );
    expect(smtp.sendMail).toHaveBeenCalledTimes(messages.length);
  });
});
