import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user) {
    return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
  }

  const member = await db.query.member.findFirst({
    where: { userId: event.locals.user.id },
    with: {
      membershipType: true,
      pendingMembershipType: true,
      events: {
        with: { feePeriod: { with: { membershipType: true } } },
        orderBy: { effectiveAt: "desc", recordedAt: "desc" },
      },
      payments: {
        with: { feePeriod: { with: { membershipType: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return { user: event.locals.user, member: member ?? null };
};
