import { z } from "zod";

export const schema = z.object({
	email: z.email(),
});
