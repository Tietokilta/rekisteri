import { Stripe } from "stripe";
import { env } from "$env/dynamic/private";
if (!env.STRIPE_API_KEY) throw new Error("STRIPE_API_KEY is not set");
if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

export const stripe = new Stripe(env.STRIPE_API_KEY);
