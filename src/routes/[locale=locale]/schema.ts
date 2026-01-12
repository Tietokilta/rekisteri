import * as z from "zod";
import { PREFERRED_LANGUAGE_VALUES } from "$lib/shared/enums";

export const userInfoSchema = z.object({
	email: z.email(),
	firstNames: z.string().min(1),
	lastName: z.string().min(1),
	homeMunicipality: z.string().min(1),
	preferredLanguage: z.enum(PREFERRED_LANGUAGE_VALUES),
	// For checkbox inputs in remote forms, use optional boolean with default
	// since unchecked checkboxes don't submit values
	isAllowedEmails: z.optional(z.boolean()).default(false),
});

export type UserInfo = z.infer<typeof userInfoSchema>;
