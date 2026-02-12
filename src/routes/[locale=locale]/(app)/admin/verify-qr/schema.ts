import * as v from "valibot";

export const verifyQrSchema = v.object({
  token: v.pipe(v.string(), v.minLength(1)),
});
