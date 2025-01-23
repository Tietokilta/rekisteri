import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { i18n } from "$lib/i18n";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { schema } from "./schema";
import { superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, i18n.resolveRoute(route("/sign-in")));
	}

	const form = await superValidate(zod(schema), {
		defaults: {
			email: event.locals.user.email,
			firstNames: event.locals.user.firstNames ?? "",
			lastName: event.locals.user.lastName ?? "",
			homeMunicipality: event.locals.user.homeMunicipality ?? "",
			isAllowedEmails: event.locals.user.isAllowedEmails,
		},
	});

	return { user: event.locals.user, form };
};

export const actions: Actions = {
	default: action,
};

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

	await db
		.update(table.user)
		.set({
			// don't allow changing email here
			firstNames: user.firstNames,
			lastName: user.lastName,
			homeMunicipality: user.homeMunicipality,
			isAllowedEmails: user.isAllowedEmails,
		})
		.where(eq(table.user.id, user.id));

	return {
		success: true,
	};
}
