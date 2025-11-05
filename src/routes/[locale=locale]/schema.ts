import * as z from "zod";
import { preferredLanguageEnumSchema } from "$lib/server/db/schema";

export const schema = z.object({
	email: z.email(),
	firstNames: z.string().min(1),
	lastName: z.string().min(1),
	homeMunicipality: z.string().min(1),
	preferredLanguage: preferredLanguageEnumSchema,
	isAllowedEmails: z.boolean(),
});
