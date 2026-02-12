import * as v from "valibot";

export const memberIdSchema = v.object({
  memberId: v.pipe(v.string(), v.minLength(1)),
});

export const memberIdWithReasonSchema = v.object({
  memberId: v.pipe(v.string(), v.minLength(1)),
  reason: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

export const bulkMemberIdsSchema = v.object({
  memberIds: v.pipe(v.array(v.string()), v.minLength(1)),
});

export const bulkMemberIdsWithReasonSchema = v.object({
  memberIds: v.pipe(v.array(v.string()), v.minLength(1)),
  reason: v.optional(v.pipe(v.string(), v.maxLength(500))),
});
