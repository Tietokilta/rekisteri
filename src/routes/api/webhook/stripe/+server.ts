import { json } from "@sveltejs/kit";
import { stripe } from "$lib/server/payment";
import { env } from "$env/dynamic/private";
import { cancelSession, fulfillSession } from "$lib/server/payment/session.js";

const endpointSecret = env.STRIPE_WEBHOOK_SECRET;

export async function POST({ request }) {
	try {
		const rawBody = await request.text();
		const signature = request.headers.get("stripe-signature");

		if (!signature) {
			return json({ message: "Missing webhook signature header" }, { status: 400 });
		}

		let event;
		try {
			event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
		} catch (err) {
			console.error("Webhook signature verification failed:", err);
			return json({ message: "Webhook signature verification failed" }, { status: 400 });
		}

		if (event.type === "checkout.session.async_payment_succeeded" || event.type === "checkout.session.completed") {
			fulfillSession(event.data.object.id);
		} else if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
			cancelSession(event.data.object.id);
		}

		return json({ received: true });
	} catch (error) {
		console.error("Error handling webhook:", error);
		return json({ error: "Webhook processing error" }, { status: 500 });
	}
}
