import * as v from "valibot";

export const payMembershipSchema = v.object({
  membershipId: v.pipe(v.string(), v.minLength(1)),
  description: v.optional(v.string()),
});
