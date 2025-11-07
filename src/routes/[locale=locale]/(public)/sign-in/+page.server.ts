import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { emailCookieName } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";

/**
 * Helper function to validate return_to URLs.
 * Only allows same domain or subdomains of tietokilta.fi to prevent open redirect attacks.
 */
function isValidReturnUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname;

		// Allow same domain or subdomains of tietokilta.fi
		return hostname === "tietokilta.fi" || hostname.endsWith(".tietokilta.fi");
	} catch {
		return false;
	}
}

export const load: PageServerLoad = async (event) => {
  // Check for return_to parameter for SSO flow
  const returnTo = event.url.searchParams.get("return_to");

  if (event.locals.user) {
    // If user is already logged in and there's a return_to, redirect there
    if (returnTo && isValidReturnUrl(returnTo)) {
      redirect(302, returnTo);
    }

    redirect(302, route("/[locale=locale]", { locale: event.locals.locale }));
  }

  // If email cookie exists, redirect to OTP verification page
  const emailCookie = event.cookies.get(emailCookieName);
  if (emailCookie) {
    const emailRoute = route("/[locale=locale]/sign-in/email", { locale: event.locals.locale });

    // Preserve return_to in email verification page
    if (returnTo && isValidReturnUrl(returnTo)) {
      redirect(302, `${emailRoute}?return_to=${encodeURIComponent(returnTo)}`);
    }

    redirect(302, emailRoute);
  }

  return { returnTo };
};
