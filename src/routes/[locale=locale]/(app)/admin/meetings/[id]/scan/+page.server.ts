import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { eq } from "drizzle-orm";
import * as table from "$lib/server/db/schema";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  const { id } = event.params;

  // Fetch meeting
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, id),
  });

  if (!meeting) {
    error(404, "Meeting not found");
  }

  // Only allow scanning during ongoing meetings or recess
  if (meeting.status !== "ongoing" && meeting.status !== "recess") {
    error(400, `Cannot scan when meeting is ${meeting.status}`);
  }

  return {
    meeting,
    adminUserId: event.locals.user.id,
  };
};
