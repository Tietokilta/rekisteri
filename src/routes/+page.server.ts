import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { i18n } from "$lib/i18n";
import { route } from "$lib/ROUTES";
import * as z from "zod";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, i18n.resolveRoute(route("/sign-in")));
	}

	return { user: event.locals.user };
};

export const actions: Actions = {
	default: action,
};

const schema = z.object({
	email: z.string().email(),
	firstNames: z.string().min(1),
	lastName: z.string().min(1),
	homeMunicipality: z.string().min(1),
	isAllowedEmails: z
		.null()
		.or(z.literal("on"))
		.transform((value) => value === "on"),
});

async function action(event: RequestEvent) {
	if (!event.locals.user) {
		return fail(401, {
			message: "Unauthorized",
		});
	}

	const formData = await event.request.formData();
	const inputData = {
		email: formData.get("email"),
		firstNames: formData.get("firstNames"),
		lastName: formData.get("lastName"),
		homeMunicipality: formData.get("homeMunicipality"),
		isAllowedEmails: formData.get("isAllowedEmails"),
	};
	const inputResult = schema.safeParse(inputData);

	if (!inputResult.success) {
		return fail(400, {
			message: "Invalid input",
			errors: inputResult.error.formErrors,
		});
	}

	if (inputResult.data.email !== event.locals.user.email) {
		return fail(403, {
			message: "Forbidden",
		});
	}

	const user = {
		...event.locals.user,
		...inputResult.data,
	};

	await db.update(table.user).set(user).where(eq(table.user.id, user.id));

	return {
		success: true,
	};
}
