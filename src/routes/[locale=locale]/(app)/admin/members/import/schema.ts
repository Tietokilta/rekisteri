import * as v from "valibot";

export const csvRowSchema = v.object({
  firstNames: v.pipe(v.string(), v.minLength(1)),
  lastName: v.pipe(v.string(), v.minLength(1)),
  homeMunicipality: v.pipe(v.string(), v.minLength(1)),
  email: v.pipe(v.string(), v.email()),
  membershipTypeId: v.pipe(v.string(), v.minLength(1)),
  membershipStartDate: v.pipe(v.string(), v.minLength(1)),
});

export const importMembersSchema = v.object({
  rows: v.pipe(v.string(), v.minLength(1)),
});

export type CsvRow = v.InferOutput<typeof csvRowSchema>;
