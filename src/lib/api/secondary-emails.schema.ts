import * as v from "valibot";

export const addSecondaryEmailSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  next: v.optional(v.string()),
});
