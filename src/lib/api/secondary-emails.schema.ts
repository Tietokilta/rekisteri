import * as v from "valibot";

export const addSecondaryEmailSchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()),
  next: v.optional(v.string()),
});
