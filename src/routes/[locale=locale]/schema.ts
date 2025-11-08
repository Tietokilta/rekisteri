import * as z from "zod";
import { PREFERRED_LANGUAGE_VALUES } from "$lib/shared/enums";

export const schema = z.object({
	email: z.email(),
	firstNames: z.string().min(1),
	lastName: z.string().min(1),
	homeMunicipality: z.string().min(1),
	preferredLanguage: z.enum(PREFERRED_LANGUAGE_VALUES),
	isAllowedEmails: z.boolean(),
});
