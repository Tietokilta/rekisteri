import * as v from "valibot";

export const memberIdSchema = v.object({
	memberId: v.pipe(v.string(), v.minLength(1)),
});
