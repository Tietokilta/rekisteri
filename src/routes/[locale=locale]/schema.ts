import * as v from "valibot";
import { PREFERRED_LANGUAGE_VALUES } from "$lib/shared/enums";

export const userInfoSchema = v.object({
	email: v.pipe(v.string(), v.email()),
	firstNames: v.pipe(v.string(), v.minLength(1)),
	lastName: v.pipe(v.string(), v.minLength(1)),
	homeMunicipality: v.pipe(v.string(), v.minLength(1)),
	preferredLanguage: v.picklist(PREFERRED_LANGUAGE_VALUES),
	// For checkbox inputs in remote forms, use optional boolean with default
	// since unchecked checkboxes don't submit values
	isAllowedEmails: v.optional(v.boolean(), false),
});

export type UserInfo = v.InferOutput<typeof userInfoSchema>;
