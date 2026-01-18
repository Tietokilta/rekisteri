import { query } from "$app/server";
import { stripe } from "$lib/server/payment";
import * as v from "valibot";

export const getStripePriceMetadata = query.batch(v.pipe(v.string(), v.minLength(1)), async (priceIds) => {
	// Validate all price IDs
	for (const priceId of priceIds) {
		if (!priceId || !priceId.startsWith("price_")) {
			throw new Error("Invalid price ID");
		}
	}

	// Fetch all prices in parallel
	const prices = await Promise.all(
		priceIds.map((priceId) =>
			stripe.prices.retrieve(priceId, {
				expand: ["product"],
			}),
		),
	);

	// Create lookup map
	const lookup = new Map(
		prices.map((price) => {
			// Extract product information
			const product =
				typeof price.product === "string"
					? { id: price.product, name: null }
					: {
							id: price.product.id,
							name: price.product.deleted ? null : price.product.name,
						};

			return [
				price.id,
				{
					priceId: price.id,
					priceCents: price.unit_amount ?? 0,
					currency: price.currency,
					nickname: price.nickname,
					productId: product.id,
					productName: product.name,
					active: price.active,
				},
			];
		}),
	);

	// Return lookup function
	return (priceId) => lookup.get(priceId);
});
