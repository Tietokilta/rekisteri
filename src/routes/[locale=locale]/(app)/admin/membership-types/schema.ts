import * as v from "valibot";

export const createMembershipTypeSchema = v.object({
  id: v.pipe(
    v.string(),
    v.minLength(1, "ID is required"),
    v.regex(/^[a-z0-9-]+$/, "ID must contain only lowercase letters, numbers, and hyphens"),
  ),
  nameFi: v.pipe(v.string(), v.minLength(1, "Finnish name is required")),
  nameEn: v.pipe(v.string(), v.minLength(1, "English name is required")),
  descriptionFi: v.optional(v.string()),
  descriptionEn: v.optional(v.string()),
});

export const updateMembershipTypeSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  nameFi: v.pipe(v.string(), v.minLength(1, "Finnish name is required")),
  nameEn: v.pipe(v.string(), v.minLength(1, "English name is required")),
  descriptionFi: v.optional(v.string()),
  descriptionEn: v.optional(v.string()),
});

export const deleteMembershipTypeSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
});
