import * as v from "valibot";

export const createMembershipSchema = v.object({
	type: v.pipe(v.string(), v.minLength(1)),
	stripePriceId: v.pipe(v.string(), v.minLength(1)),
	startTime: v.pipe(v.string(), v.minLength(1)),
	endTime: v.pipe(v.string(), v.minLength(1)),
	priceCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
	// For checkbox inputs in remote forms, use optional boolean with default
	// since unchecked checkboxes don't submit values
	requiresStudentVerification: v.optional(v.boolean(), false),
});

export const deleteMembershipSchema = v.object({
	id: v.pipe(v.string(), v.uuid()),
});
