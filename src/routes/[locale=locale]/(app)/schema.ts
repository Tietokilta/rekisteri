import * as v from "valibot";
import { nameSchema } from "#lib/shared/name.js";
import { PREFERRED_LANGUAGE_VALUES } from "#lib/shared/enums.js";

/** Issue message for an empty required field. Forms translate it with `$LL.common.fieldRequired()`. */
export const REQUIRED_FIELD_MESSAGE = "This field is required";

export const userInfoSchema = v.object({
  firstNames: v.pipe(nameSchema, v.minLength(1, REQUIRED_FIELD_MESSAGE)),
  lastName: v.pipe(nameSchema, v.minLength(1, REQUIRED_FIELD_MESSAGE)),
  homeMunicipality: v.pipe(v.string(), v.minLength(1, REQUIRED_FIELD_MESSAGE)),
  preferredLanguage: v.picklist(PREFERRED_LANGUAGE_VALUES),
  // For checkbox inputs in remote forms, use optional boolean with default
  // since unchecked checkboxes don't submit values
  isAllowedEmails: v.optional(v.boolean(), false),
});
