import { json } from "@sveltejs/kit";
import { stripe } from "$lib/server/payment";
import { env } from "$lib/server/env";
import { cancelSession, fulfillSession } from "$lib/server/payment/session.js";
import { logger } from "$lib/server/telemetry";

const endpointSecret = env.STRIPE_WEBHOOK_SECRET;

// Track processed events to prevent replay attacks
const processedEvents = new Set<string>();
const MAX_PROCESSED_EVENTS = 10_000;

export async function POST({ request }) {
  return logger.startSpan("stripe.webhook.handle", async (span) => {
    try {
      const rawBody = await request.text();
      const signature = request.headers.get("stripe-signature");

      if (!signature) {
        logger.error("stripe.webhook.missing_signature");
        return json({ message: "Missing webhook signature header" }, { status: 400 });
      }

      let event;
      try {
        // Stripe's constructEvent includes timestamp verification with 300s tolerance
        // to prevent replay attacks
        event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
      } catch (err) {
        logger.error("stripe.webhook.signature_verification_failed", err);
        return json({ message: "Webhook signature verification failed" }, { status: 400 });
      }

      // Add event context to span
      span.setAttribute("stripe.event.id", event.id);
      span.setAttribute("stripe.event.type", event.type);

      // Additional replay protection: check if we've already processed this event
      if (processedEvents.has(event.id)) {
        logger.warn("stripe.webhook.duplicate_event", {
          "stripe.event.id": event.id,
        });
        return json({ received: true, duplicate: true });
      }

      // Add to processed events (with size limit to prevent memory leak)
      processedEvents.add(event.id);
      if (processedEvents.size > MAX_PROCESSED_EVENTS) {
        // Remove oldest entries (first 1000) using iterator for efficiency
        const iterator = processedEvents.values();
        for (let i = 0; i < 1000; i++) {
          const { value, done } = iterator.next();
          if (done) break;
          processedEvents.delete(value);
        }
      }

      logger.info("stripe.webhook.received", {
        "stripe.event.id": event.id,
        "stripe.event.type": event.type,
      });

      // Handle webhook events with proper error handling
      try {
        if (event.type === "checkout.session.async_payment_succeeded" || event.type === "checkout.session.completed") {
          await fulfillSession(event.data.object.id);
          logger.info("stripe.webhook.session_fulfilled", {
            "stripe.session.id": event.data.object.id,
            "stripe.event.id": event.id,
          });
        } else if (
          event.type === "checkout.session.async_payment_failed" ||
          event.type === "checkout.session.expired"
        ) {
          await cancelSession(event.data.object.id);
          logger.info("stripe.webhook.session_cancelled", {
            "stripe.session.id": event.data.object.id,
            "stripe.event.id": event.id,
          });
        }
      } catch (processingError) {
        // Log but don't fail the webhook - Stripe will retry
        logger.error("stripe.webhook.processing_error", processingError, {
          "stripe.event.id": event.id,
          "stripe.event.type": event.type,
        });
        // Still return 200 to Stripe to acknowledge receipt, but log the error
        return json({ received: true, error: "Processing error - will retry" }, { status: 200 });
      }

      return json({ received: true });
    } catch (error) {
      logger.error("stripe.webhook.unexpected_error", error);
      return json({ error: "Webhook processing error" }, { status: 500 });
    }
  });
}
