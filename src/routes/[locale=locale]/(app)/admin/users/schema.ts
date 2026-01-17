import * as v from "valibot";

export const promoteToAdminSchema = v.object({
	userId: v.pipe(v.string(), v.minLength(1)),
});

export const demoteFromAdminSchema = v.object({
	userId: v.pipe(v.string(), v.minLength(1)),
});

export const mergeUsersSchema = v.object({
	primaryUserId: v.pipe(v.string(), v.minLength(1)),
	secondaryUserId: v.pipe(v.string(), v.minLength(1)),
	confirmPrimaryEmail: v.pipe(v.string(), v.email()),
	confirmSecondaryEmail: v.pipe(v.string(), v.email()),
});
