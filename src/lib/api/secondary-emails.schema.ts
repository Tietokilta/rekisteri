import { z } from "zod";

export const addSecondaryEmailSchema = z.object({
	email: z.email(),
});
