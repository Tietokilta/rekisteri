import { error } from "@sveltejs/kit";
import { getRequestEvent, query } from "$app/server";
import { stripe } from "$lib/server/payment";
import * as v from "valibot";

type StripePrice = Awaited<ReturnType<typeof stripe.prices.retrieve>>;

type StripePriceMetadata = {
  priceId: string;
  priceCents: number;
  currency: string;
  nickname: string | null;
  productId: string;
  productName: string | null;
  active: boolean;
};

type PriceLookup = {
  prices: Map<string, StripePriceMetadata>;
  errors: Map<string, Error>;
};

function validatePriceIds(priceIds: string[]): void {
  for (const priceId of priceIds) {
    if (!priceId || !priceId.startsWith("price_")) {
      throw new Error(`Invalid price ID: ${priceId}`);
    }
  }
}

function normalizeProduct(product: StripePrice["product"]): { id: string; name: string | null } {
  if (typeof product === "string") {
    return { id: product, name: null };
  }

  return {
    id: product.id,
    name: product.deleted ? null : product.name,
  };
}

function toStripePriceMetadata(price: StripePrice): StripePriceMetadata {
  const product = normalizeProduct(price.product);

  return {
    priceId: price.id,
    priceCents: price.unit_amount ?? 0,
    currency: price.currency,
    nickname: price.nickname,
    productId: product.id,
    productName: product.name,
    active: price.active,
  };
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function collectPriceLookup(priceIds: string[], priceResults: PromiseSettledResult<StripePrice>[]): PriceLookup {
  const prices = new Map<string, StripePriceMetadata>();
  const errors = new Map<string, Error>();

  for (const [index, result] of priceResults.entries()) {
    const priceId = priceIds[index];
    if (!priceId) continue;

    if (result.status === "fulfilled") {
      prices.set(priceId, toStripePriceMetadata(result.value));
    } else {
      errors.set(priceId, toError(result.reason));
    }
  }

  return { prices, errors };
}

function readPriceMetadata(priceId: string, lookup: PriceLookup): StripePriceMetadata {
  const priceError = lookup.errors.get(priceId);
  if (priceError) {
    throw priceError;
  }

  const price = lookup.prices.get(priceId);
  if (!price) {
    throw new Error(`Price ${priceId} not found in batch results`);
  }

  return price;
}

export const getStripePriceMetadata = query.batch(v.pipe(v.string(), v.minLength(1)), async (priceIds) => {
  const { locals } = getRequestEvent();

  if (!locals.user) {
    throw error(401, "Not authenticated");
  }

  validatePriceIds(priceIds);

  const priceResults = await Promise.allSettled(
    priceIds.map((priceId) =>
      stripe.prices.retrieve(priceId, {
        expand: ["product"],
      }),
    ),
  );

  const lookup = collectPriceLookup(priceIds, priceResults);

  return (priceId) => readPriceMetadata(priceId, lookup);
});
