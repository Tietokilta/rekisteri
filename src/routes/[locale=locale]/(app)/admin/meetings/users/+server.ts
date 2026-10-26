import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "#lib/server/db/index.js";
import * as table from "#lib/server/db/schema.js";
import { membershipTypesAt } from "#lib/server/membership/status.js";
import { userHasAdminWriteAccess } from "#lib/server/auth/admin.js";

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
  return Response.json(
    users.map((user) => ({ ...user, membershipTypeId: typeByUser.get(user.id) ?? null })),
    { headers: { "cache-control": "no-store" } },
  );
};
