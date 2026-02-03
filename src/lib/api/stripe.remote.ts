import { error } from "@sveltejs/kit";
import { getRequestEvent, query } from "$app/server";
import { stripe } from "$lib/server/payment";
import * as v from "valibot";

export const getStripePriceMetadata = query.batch(v.pipe(v.string(), v.minLength(1)), async (priceIds) => {
  const { locals } = getRequestEvent();

  if (!locals.user) {
    throw error(401, "Not authenticated");
  }

  // Validate all price IDs
  for (const priceId of priceIds) {
    if (!priceId || !priceId.startsWith("price_")) {
      throw new Error(`Invalid price ID: ${priceId}`);
    }
  }

  // Fetch all prices in parallel with error handling
  const priceResults = await Promise.allSettled(
    priceIds.map((priceId) =>
      stripe.prices.retrieve(priceId, {
        expand: ["product"],
      }),
    ),
  );

  // Create lookup map - for failed fetches, throw error when accessed
  // This allows the svelte:boundary to catch individual price fetch failures
  const lookup = new Map<
    string,
    {
      priceId: string;
      priceCents: number;
      currency: string;
      nickname: string | null;
      productId: string;
      productName: string | null;
      active: boolean;
    }
  >();

  const errors = new Map<string, Error>();

  for (const [index, result] of priceResults.entries()) {
    const priceId = priceIds[index];
    if (!priceId) continue;
    if (result.status === "fulfilled") {
      const price = result.value;
      const product =
        typeof price.product === "string"
          ? { id: price.product, name: null }
          : {
              id: price.product.id,
              name: price.product.deleted ? null : price.product.name,
            };

      lookup.set(priceId, {
        priceId: price.id,
        priceCents: price.unit_amount ?? 0,
        currency: price.currency,
        nickname: price.nickname,
        productId: product.id,
        productName: product.name,
        active: price.active,
      });
    } else {
      // Store the error to throw when this specific price is accessed
      errors.set(priceId, result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
    }
  }

  // Return lookup function that throws if price not found or had an error
  return (priceId) => {
    const err = errors.get(priceId);
    if (err) {
      throw err;
    }
    const result = lookup.get(priceId);
    if (!result) {
      throw new Error(`Price ${priceId} not found in batch results`);
    }
    return result;
  };
});
