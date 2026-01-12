import * as z from "zod";

export const createMembershipSchema = z.object({
	type: z.string().min(1),
	stripePriceId: z.string().min(1),
	startTime: z.string().min(1),
	endTime: z.string().min(1),
	priceCents: z.number().int().nonnegative(),
	// For checkbox inputs in remote forms, use optional boolean with default
	// since unchecked checkboxes don't submit values
	requiresStudentVerification: z.optional(z.boolean()).default(false),
});

export const deleteMembershipSchema = z.object({
	id: z.uuid(),
});
