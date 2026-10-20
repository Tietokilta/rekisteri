import { Stripe } from "stripe";
import { env } from "$lib/server/env";

const apiUrl = env.STRIPE_API_URL ? new URL(env.STRIPE_API_URL) : undefined;

export const stripe = new Stripe(
  env.STRIPE_API_KEY,
  apiUrl && {
    host: apiUrl.hostname,
    port: apiUrl.port || undefined,
    protocol: apiUrl.protocol === "http:" ? "http" : "https",
  },
);
