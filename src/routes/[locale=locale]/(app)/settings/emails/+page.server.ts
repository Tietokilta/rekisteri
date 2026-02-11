import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getUserSecondaryEmails } from "$lib/server/auth/secondary-email";
import { getLL } from "$lib/server/i18n";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    return error(401, getLL(locals.locale).error.notAuthenticated());
  }

  const emails = await getUserSecondaryEmails(locals.user.id);

  return {
    emails,
    primaryEmail: locals.user.email,
  };
};
