import * as v from "valibot";

export const revokeGrantSchema = v.object({
  clientId: v.pipe(v.string(), v.minLength(1)),
});
