import * as v from "valibot";

export const verifyCodeSchema = v.object({
	code: v.pipe(v.string(), v.minLength(1)),
});
