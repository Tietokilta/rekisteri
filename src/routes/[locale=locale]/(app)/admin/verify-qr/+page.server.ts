import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { userHasAdminAccess } from "$lib/server/auth/admin";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) {
    return error(404, "Not found");
  }

  return {};
};
