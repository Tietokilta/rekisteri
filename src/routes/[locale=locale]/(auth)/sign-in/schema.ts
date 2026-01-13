import * as z from "zod";

export const signInSchema = z.object({
	email: z.email(),
});
