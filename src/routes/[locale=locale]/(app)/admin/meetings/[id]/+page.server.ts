import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { getMeetingState } from "$lib/server/attendance/meeting";
import { userHasAdminAccess, userHasAdminWriteAccess } from "$lib/server/auth/admin";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) error(404, "Not found");
  const meeting = await db.query.meeting.findFirst({ where: { id: event.params.id } });
  if (!meeting) error(404, "Meeting not found");
  const [state, types] = await Promise.all([
    getMeetingState(meeting.id, meeting.startsAt),
    db.select({ id: table.membershipType.id, name: table.membershipType.name }).from(table.membershipType),
  ]);
  return { meeting, ...state, types, canWrite: userHasAdminWriteAccess(event.locals.user) };
};
