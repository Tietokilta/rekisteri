import * as z from "zod";

export const createSchema = z.object({
	type: z.string().min(1),
	stripePriceId: z.string().min(1),
	startTime: z.string().date(),
	endTime: z.string().date(),
	priceCents: z.coerce.number().int().nonnegative(),
});

export const deleteSchema = z.object({
	id: z.string().uuid(),
});
