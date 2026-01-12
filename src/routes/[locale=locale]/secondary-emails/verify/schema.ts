import * as z from "zod";

export const verifyCodeSchema = z.object({
	code: z.string().min(1),
});
