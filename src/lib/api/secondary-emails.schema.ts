import * as v from "valibot";

export const addSecondaryEmailSchema = v.object({
	email: v.pipe(v.string(), v.email()),
	// Optional redirect URL for returning to the original page after verification
	redirect: v.optional(v.pipe(v.string(), v.minLength(1))),
});
