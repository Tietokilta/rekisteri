import { query } from "$app/server";
import { stripe } from "$lib/server/payment";
import * as v from "valibot";

export const getStripePriceMetadata = query(v.pipe(v.string(), v.minLength(1)), async (priceId) => {
	if (!priceId || !priceId.startsWith("price_")) {
		throw new Error("Invalid price ID");
	}

	const price = await stripe.prices.retrieve(priceId, {
		expand: ["product"],
	});

	// Extract product information
	const product =
		typeof price.product === "string"
			? { id: price.product, name: null }
			: {
					id: price.product.id,
					name: price.product.deleted ? null : price.product.name,
				};

	return {
		priceId: price.id,
		priceCents: price.unit_amount ?? 0,
		currency: price.currency,
		nickname: price.nickname,
		productId: product.id,
		productName: product.name,
		active: price.active,
	};
});
