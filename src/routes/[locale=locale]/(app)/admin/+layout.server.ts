import type { LayoutServerLoad } from "./$types";
import { hasAdminWriteAccess } from "$lib/server/auth/admin";

export const load: LayoutServerLoad = (event) => {
  return { canWrite: hasAdminWriteAccess(event.locals.user) };
};
