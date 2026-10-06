import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { membershipTypesAt } from "$lib/server/attendance/membership";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";

/** Every registry user for the check-in search, which filters them in the browser. */
export const GET: RequestHandler = async (event) => {
  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) error(404, "Not found");
  const [users, typeByUser] = await Promise.all([
    db
      .select({
        id: table.user.id,
        email: table.user.email,
        firstNames: table.user.firstNames,
        lastName: table.user.lastName,
      })
      .from(table.user),
    membershipTypesAt(db, new Date()),
  ]);
  return json(
    users.map((user) => ({ ...user, membershipTypeId: typeByUser.get(user.id) ?? null })),
    { headers: { "cache-control": "no-store" } },
  );
};
