import * as z from "zod";

export const payMembershipSchema = z.object({
	membershipId: z.string().min(1),
});
