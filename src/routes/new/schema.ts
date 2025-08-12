import * as z from "zod/v4";

export const schema = z.object({
	membershipId: z.string(),
});
