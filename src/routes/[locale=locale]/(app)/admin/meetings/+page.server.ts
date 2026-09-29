import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { desc } from "drizzle-orm";
import { userHasAdminAccess, userHasAdminWriteAccess } from "$lib/server/auth/admin";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) error(404, "Not found");
  return {
    meetings: await db.select().from(table.meeting).orderBy(desc(table.meeting.createdAt)).limit(50),
    canWrite: userHasAdminWriteAccess(event.locals.user),
  };
};
