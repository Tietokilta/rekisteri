import { error, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import * as z from "zod";
import { RefillingTokenBucket } from "$lib/server/auth/rate-limit";
import { setEmailCookie } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";

// Rate limit: 100 sign-in attempts per minute per IP (generous for shared networks)
const ipBucket = new RefillingTokenBucket<string>(100, 60);
// Rate limit: 10 sign-in attempts per hour per email (strict per-account protection)
const emailBucket = new RefillingTokenBucket<string>(10, 60 * 60);

export const signInSchema = z.object({
	email: z.email(),
});

export const signIn = form(signInSchema, async ({ email: rawEmail }) => {
	const event = getRequestEvent();

	// Lazy cleanup to prevent memory leaks
	ipBucket.cleanup();
	emailBucket.cleanup();

	// Use adapter-provided client IP (respects ADDRESS_HEADER environment variable)
	// Azure App Service provides X-Client-IP header (no port, cannot be spoofed)
	// See: https://github.com/Azure/app-service-linux-docs/blob/master/Things_You_Should_Know/headers.md
	const clientIP = event.getClientAddress();

	if (!ipBucket.check(clientIP, 1)) {
		error(
			429,
			"Too many requests. This could be due to network activity or multiple attempts. Try again later or from a different network.",
		);
	}

	// Normalize email to lowercase to ensure case-insensitive matching
	const email = rawEmail.toLowerCase();

	// Check email rate limit
	if (!emailBucket.check(email, 1)) {
		error(
			429,
			"Too many requests. This could be due to network activity or multiple attempts. Try again later or from a different network.",
		);
	}

	// Consume from both buckets
	if (!ipBucket.consume(clientIP, 1) || !emailBucket.consume(email, 1)) {
		error(
			429,
			"Too many requests. This could be due to network activity or multiple attempts. Try again later or from a different network.",
		);
	}

	setEmailCookie(event, email, new Date(Date.now() + 1000 * 60 * 10));

	// Always redirect to method selection page (prevents user enumeration)
	redirect(303, route("/[locale=locale]/sign-in/method", { locale: event.locals.locale }));
});
