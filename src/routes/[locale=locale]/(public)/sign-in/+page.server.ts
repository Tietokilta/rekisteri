import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { emailCookieName } from "$lib/server/auth/email";
import { consumeSignInNext, setSignInNextCookie } from "$lib/server/auth/sign-in-next";
import { route } from "$lib/ROUTES";

export const load: PageServerLoad = async (event) => {
  setSignInNextCookie(event, event.url.searchParams.get("next"));

  if (event.locals.user) {
    redirect(302, consumeSignInNext(event));
  }

  // If email cookie exists, redirect to OTP verification page
  const emailCookie = event.cookies.get(emailCookieName);
  if (emailCookie) {
    redirect(302, route("/[locale=locale]/sign-in/email", { locale: event.locals.locale }));
  }

  return {};
};
