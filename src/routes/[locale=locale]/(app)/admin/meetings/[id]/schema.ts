import * as v from "valibot";

/**
 * Schema for transitioning meeting state.
 */
export const transitionMeetingSchema = v.object({
  meetingId: v.string(),
  action: v.picklist(["start", "recess_start", "recess_end", "finish"]),
  notes: v.optional(v.pipe(v.string(), v.trim())),
});

export type TransitionMeetingInput = v.InferInput<typeof transitionMeetingSchema>;
export type TransitionMeetingOutput = v.InferOutput<typeof transitionMeetingSchema>;

/**
 * Schema for checking out all attendees.
 */
export const checkOutAllSchema = v.object({
  meetingId: v.string(),
});

export type CheckOutAllInput = v.InferInput<typeof checkOutAllSchema>;
export type CheckOutAllOutput = v.InferOutput<typeof checkOutAllSchema>;
