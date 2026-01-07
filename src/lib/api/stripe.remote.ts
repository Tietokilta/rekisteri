import { stripe } from "$lib/server/payment";

export async function getStripePriceMetadata(priceId: string) {
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
}

export async function getStripePriceMetadataBatch(priceIds: string[]) {
	const results = await Promise.allSettled(priceIds.map((id) => getStripePriceMetadata(id)));

	return results.map((result, index) => ({
		priceId: priceIds[index],
		data: result.status === "fulfilled" ? result.value : null,
		error: result.status === "rejected" ? result.reason.message : null,
	}));
}
