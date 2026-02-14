import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { createMeetingSchema } from "./schema";

/**
 * Creates a new meeting.
 * Only accessible to admin users.
 */
export const createMeeting = form(createMeetingSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  const id = crypto.randomUUID();
  await db.insert(table.meeting).values({
    id,
    name: data.name,
    description: data.description || null,
    status: "upcoming",
  });

  return {
    success: true,
    meetingId: id,
  };
});
