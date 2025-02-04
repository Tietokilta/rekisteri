import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { SUMUP_API_KEY, SUMUP_PAY_TO_EMAIL } from "$env/static/private";

const baseUrl = "https://api.sumup.com/v0.1";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}
};

export const actions: Actions = {
	makePayment,
};

async function makePayment(event: RequestEvent) {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return fail(403, { message: "Forbidden" });
	}

	const testing = await fetch(`${baseUrl}/me`, {
		headers: {
			Authorization: `Bearer ${SUMUP_API_KEY}`,
		},
	});
	const testingData = await testing.json();
	console.log(testingData);

	const checkoutReference = crypto.randomUUID();

	const result = await fetch(`${baseUrl}/checkouts`, {
		method: "post",
		headers: {
			Authorization: `Bearer ${SUMUP_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			checkout_reference: checkoutReference,
			amount: 7,
			currency: "EUR",
			pay_to_email: SUMUP_PAY_TO_EMAIL,
			description: "Test payment",
		}),
	});

	const data = await result.json();

	console.log(data);
}
