import * as v from "valibot";

export const memberIdSchema = v.object({
  memberId: v.pipe(v.string(), v.minLength(1)),
});

export const bulkMemberIdsSchema = v.object({
  memberIds: v.pipe(v.array(v.string()), v.minLength(1)),
});
