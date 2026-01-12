import * as z from "zod";

export const promoteToAdminSchema = z.object({
	userId: z.string().min(1),
});

export const demoteFromAdminSchema = z.object({
	userId: z.string().min(1),
});
