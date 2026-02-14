import * as v from "valibot";

/**
 * Schema for creating a new meeting.
 */
export const createMeetingSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, "Meeting name is required")),
  description: v.optional(v.pipe(v.string(), v.trim())),
});

export type CreateMeetingInput = v.InferInput<typeof createMeetingSchema>;
export type CreateMeetingOutput = v.InferOutput<typeof createMeetingSchema>;
