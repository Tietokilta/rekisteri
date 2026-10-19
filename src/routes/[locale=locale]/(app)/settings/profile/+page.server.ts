import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { signInHref } from "#lib/server/auth/sign-in-next.js";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user) {
    redirect(302, signInHref(event));
  }

  return { user: event.locals.user };
};
