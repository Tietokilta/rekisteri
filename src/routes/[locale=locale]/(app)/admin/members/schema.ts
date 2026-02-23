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

// Statuses that admins can set when manually creating a member
const adminCreateStatusSchema = v.picklist(["awaiting_approval", "active"]);

// Discriminated union for creating a member — either a person or an association
export const createPersonMemberSchema = v.object({
  type: v.literal("person"),
  email: v.pipe(v.string(), v.email()),
  firstNames: v.optional(v.string()),
  lastName: v.optional(v.string()),
  homeMunicipality: v.optional(v.string()),
  membershipId: v.pipe(v.string(), v.minLength(1)),
  status: adminCreateStatusSchema,
  description: v.optional(v.string()),
});

export const createAssociationMemberSchema = v.object({
  type: v.literal("association"),
  organizationName: v.pipe(v.string(), v.trim(), v.minLength(1)),
  membershipId: v.pipe(v.string(), v.minLength(1)),
  status: adminCreateStatusSchema,
  description: v.optional(v.string()),
});

export const createMemberSchema = v.variant("type", [createPersonMemberSchema, createAssociationMemberSchema]);
