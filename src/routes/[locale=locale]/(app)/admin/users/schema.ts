import * as v from "valibot";
import { ADMIN_ROLE_VALUES } from "$lib/shared/enums";

export const updateUserRoleSchema = v.object({
  userId: v.pipe(v.string(), v.minLength(1)),
  role: v.picklist(ADMIN_ROLE_VALUES),
});

export const mergeUsersSchema = v.object({
  primaryUserId: v.pipe(v.string(), v.minLength(1)),
  secondaryUserId: v.pipe(v.string(), v.minLength(1)),
  confirmPrimaryEmail: v.pipe(v.string(), v.email()),
  confirmSecondaryEmail: v.pipe(v.string(), v.email()),
});
