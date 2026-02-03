import * as v from "valibot";

export const signInSchema = v.object({
	email: v.pipe(v.string(), v.email()),
});
