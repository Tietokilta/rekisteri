import type { RequestHandler } from "./$types";
import * as z from "zod";

const webhookPayloadSchema = z.object({
	event_type: z.enum(["CHECKOUT_STATUS_CHANGED"]),
	id: z.string(),
});

export const POST: RequestHandler = async (event) => {
	const body = await event.request.json();
	const payload = webhookPayloadSchema.safeParse(body);

	if (!payload.success) {
		console.warn("Invalid webhook payload", payload.error, body);
		return new Response(null, { status: 200 });
	}

	if (payload.data.event_type !== "CHECKOUT_STATUS_CHANGED") {
		console.warn("Unsupported event type", payload.data.event_type);
		return new Response(null, { status: 200 });
	}

	console.log("Webhook received", payload.data.id);

	// TODO: Do something with the webhook payload

	return new Response(null, { status: 200 });
};
