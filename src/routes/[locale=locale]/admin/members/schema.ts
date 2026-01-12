import * as z from "zod";

export const memberIdSchema = z.object({
	memberId: z.string().min(1),
});
