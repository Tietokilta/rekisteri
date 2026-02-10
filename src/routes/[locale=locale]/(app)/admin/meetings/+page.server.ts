import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { desc } from "drizzle-orm";
import * as table from "$lib/server/db/schema";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  // Fetch all meetings, ordered by creation date (newest first)
  const meetings = await db.query.meeting.findMany({
    orderBy: [desc(table.meeting.createdAt)],
  });

  return {
    meetings,
  };
};
