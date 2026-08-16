import * as v from "valibot";

export const payMembershipSchema = v.object({
  feePeriodId: v.pipe(v.string(), v.minLength(1)),
  description: v.optional(v.string()),
});
