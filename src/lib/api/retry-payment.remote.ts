import { error, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { resumeOrCreateSession } from "$lib/server/payment/session";
import { retryPaymentSchema } from "./retry-payment.schema";

export const retryPayment = form(retryPaymentSchema, async ({ memberId }) => {
  const event = getRequestEvent();

  if (!event.locals.user) {
    error(401, "Unauthorized");
  }

  // Verify the member belongs to this user and is awaiting_payment
  const member = await db.query.member.findFirst({
    where: and(eq(table.member.id, memberId), eq(table.member.userId, event.locals.user.id)),
  });

  if (!member) {
    error(404, "Member record not found");
  }

  if (member.status !== "awaiting_payment") {
    error(400, "This membership is not awaiting payment");
  }

  try {
    const result = await resumeOrCreateSession(memberId, event.locals.locale);
    if (!result?.url) {
      error(400, "Could not create or resume payment session");
    }
    redirect(303, result.url);
  } catch (e) {
    // Surface user-friendly error messages from resumeOrCreateSession
    if (e instanceof Error && e.message.includes("Your payment is being processed")) {
      error(400, e.message);
    }
    throw e;
  }
});
