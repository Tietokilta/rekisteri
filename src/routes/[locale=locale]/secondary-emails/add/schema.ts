import { z } from "zod";

export const schema = z.object({
	email: z.string().min(1).email(),
});
