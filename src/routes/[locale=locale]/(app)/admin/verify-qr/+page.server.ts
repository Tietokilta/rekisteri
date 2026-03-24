import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { hasAdminAccess } from "$lib/server/auth/admin";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !hasAdminAccess(event.locals.user)) {
    return error(404, "Not found");
  }

  return {};
};
