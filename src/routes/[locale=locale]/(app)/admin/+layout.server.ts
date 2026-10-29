import type { LayoutServerLoad } from "./$types";
import { userHasAdminWriteAccess } from "#lib/server/auth/admin.js";

export const load: LayoutServerLoad = (event) => {
  return { canWrite: userHasAdminWriteAccess(event.locals.user) };
};
