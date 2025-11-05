import * as z from "zod";

export const schema = z.object({
	membershipId: z.string(),
});
