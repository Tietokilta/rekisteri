import * as v from "valibot";

export const promoteToAdminSchema = v.object({
	userId: v.pipe(v.string(), v.minLength(1)),
});

export const demoteFromAdminSchema = v.object({
	userId: v.pipe(v.string(), v.minLength(1)),
});
