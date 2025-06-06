import Mailgun from "mailgun.js";
import type { MessagesSendResult } from "mailgun.js/definitions";
import { env } from "$env/dynamic/private";

interface SendEmailOptions {
	to: string;
	subject: string;
	text: string;
}

export const sendEmail = async (options: SendEmailOptions): Promise<MessagesSendResult> => {
	if (!env.MAILGUN_API_KEY) {
		throw Error("MAILGUN API KEY NOT FOUND");
	}
	if (!env.MAILGUN_DOMAIN) {
		throw Error("MAILGUN DOMAIN NOT FOUND");
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
