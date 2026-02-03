import * as v from "valibot";

export const retryPaymentSchema = v.object({
  memberId: v.pipe(v.string(), v.uuid()),
});
