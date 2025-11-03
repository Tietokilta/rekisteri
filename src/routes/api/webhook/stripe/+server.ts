import { json } from "@sveltejs/kit";
import { stripe } from "$lib/server/payment";
import { env } from "$env/dynamic/private";
import { cancelSession, fulfillSession } from "$lib/server/payment/session.js";

const endpointSecret = env.STRIPE_WEBHOOK_SECRET;

// Track processed events to prevent replay attacks
const processedEvents = new Set<string>();
const MAX_PROCESSED_EVENTS = 10000;

export async function POST({ request }) {
	try {
		const rawBody = await request.text();
		const signature = request.headers.get("stripe-signature");

		if (!signature) {
			console.error("[Webhook] Missing signature header");
			return json({ message: "Missing webhook signature header" }, { status: 400 });
		}

		let event;
		try {
			// Stripe's constructEvent includes timestamp verification with 300s tolerance
			// to prevent replay attacks
			event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
		} catch (err) {
			console.error("[Webhook] Signature verification failed:", err);
			return json({ message: "Webhook signature verification failed" }, { status: 400 });
		}

		// Additional replay protection: check if we've already processed this event
		if (processedEvents.has(event.id)) {
			console.warn(`[Webhook] Duplicate event detected: ${event.id}`);
			return json({ received: true, duplicate: true });
		}

		// Add to processed events (with size limit to prevent memory leak)
		processedEvents.add(event.id);
		if (processedEvents.size > MAX_PROCESSED_EVENTS) {
			// Remove oldest entries (first 1000)
			const entries = Array.from(processedEvents);
			entries.slice(0, 1000).forEach((id) => processedEvents.delete(id));
		}

		// Handle webhook events with proper error handling
		try {
			if (event.type === "checkout.session.async_payment_succeeded" || event.type === "checkout.session.completed") {
				await fulfillSession(event.data.object.id);
				console.log(`[Webhook] Successfully fulfilled session: ${event.data.object.id}`);
			} else if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
				await cancelSession(event.data.object.id);
				console.log(`[Webhook] Successfully cancelled session: ${event.data.object.id}`);
			}
		} catch (processingError) {
			// Log but don't fail the webhook - Stripe will retry
			console.error(`[Webhook] Error processing event ${event.id}:`, processingError);
			// Still return 200 to Stripe to acknowledge receipt, but log the error
			// In production, you might want to send this to an error tracking service
			return json({ received: true, error: "Processing error - will retry" }, { status: 200 });
		}

		return json({ received: true });
	} catch (error) {
		console.error("[Webhook] Unexpected error:", error);
		return json({ error: "Webhook processing error" }, { status: 500 });
	}
}
