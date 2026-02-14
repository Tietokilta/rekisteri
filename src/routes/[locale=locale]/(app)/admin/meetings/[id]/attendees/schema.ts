import * as v from "valibot";

/**
 * Schema for manual check-in.
 */
export const manualCheckInSchema = v.object({
  meetingId: v.string(),
  userId: v.string(),
});

export type ManualCheckInInput = v.InferInput<typeof manualCheckInSchema>;
export type ManualCheckInOutput = v.InferOutput<typeof manualCheckInSchema>;

/**
 * Schema for manual check-out.
 */
export const manualCheckOutSchema = v.object({
  meetingId: v.string(),
  userId: v.string(),
});

export type ManualCheckOutInput = v.InferInput<typeof manualCheckOutSchema>;
export type ManualCheckOutOutput = v.InferOutput<typeof manualCheckOutSchema>;
