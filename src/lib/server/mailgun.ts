import FormData from "form-data";
import Mailgun, { type MessagesSendResult } from "mailgun.js";
import { env } from "$env/dynamic/private";

interface SendEmailOptions {
	to: string;
	subject: string;
	html: string;
}

export const sendEmail = async (options: SendEmailOptions): Promise<MessagesSendResult> => {
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
		html: options.html,
	});
};
