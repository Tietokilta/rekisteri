import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { userInfoSchema } from "./schema";

export const saveUserInfo = form(userInfoSchema, async (data) => {
	const event = getRequestEvent();

	if (!event.locals.user) {
		error(401, "Unauthorized");
	}

	try {
		await db
			.update(table.user)
			.set({
				// don't allow changing email here
				firstNames: data.firstNames,
				lastName: data.lastName,
				homeMunicipality: data.homeMunicipality,
				preferredLanguage: data.preferredLanguage,
				isAllowedEmails: data.isAllowedEmails,
			})
			.where(eq(table.user.id, event.locals.user.id));
	} catch {
		error(500, "Failed to update user information");
	}
});
