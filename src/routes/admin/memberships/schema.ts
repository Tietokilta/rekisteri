import * as z from "zod/v4";

export const createSchema = z.object({
	type: z.string().min(1),
	stripePriceId: z.string().min(1),
	startTime: z.iso.date(),
	endTime: z.iso.date(),
	priceCents: z.coerce.number().int().nonnegative(),
	requiresStudentVerification: z.coerce.boolean().default(false),
});

export const deleteSchema = z.object({
	id: z.uuid(),
});
