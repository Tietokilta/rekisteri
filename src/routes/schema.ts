import * as z from "zod";

export const schema = z.object({
	email: z.email(),
	firstNames: z.string().min(1),
	lastName: z.string().min(1),
	homeMunicipality: z.string().min(1),
	isAllowedEmails: z.boolean(),
});
