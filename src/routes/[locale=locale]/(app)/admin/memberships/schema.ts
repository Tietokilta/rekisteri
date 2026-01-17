import * as v from "valibot";
import { getStripePriceMetadata } from "$lib/api/stripe.remote";

export const createMembershipSchema = v.pipeAsync(
	v.object({
		type: v.pipe(v.string(), v.minLength(1)),
		stripePriceId: v.pipe(v.string(), v.minLength(1)),
		startTime: v.pipe(v.string(), v.minLength(1)),
		endTime: v.pipe(v.string(), v.minLength(1)),
		// For checkbox inputs in remote forms, use optional boolean with default
		// since unchecked checkboxes don't submit values
		requiresStudentVerification: v.optional(v.boolean(), false),
	}),
	v.checkAsync(async (input) => {
		try {
			await getStripePriceMetadata(input.stripePriceId);
			return true;
		} catch {
			return false;
		}
	}, "Invalid Stripe price ID or price not found"),
);

export const deleteMembershipSchema = v.object({
	id: v.pipe(v.string(), v.uuid()),
});
