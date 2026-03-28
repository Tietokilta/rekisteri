import { error, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { updateCustomisationSchema } from "./schema";
import { eq } from "drizzle-orm";
import { updateCustomisationCache, getCustomisations } from "$lib/server/customisation/cache";
import { flattenCustomisation, processUploadedFile } from "$lib/server/customisation/utils";
import { getLL } from "$lib/server/i18n";
import * as v from "valibot";
import { hasAdminAccess, hasAdminWriteAccess } from "$lib/shared/enums";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !hasAdminAccess(event.locals.user?.adminRole ?? "none")) {
    return error(404, "Not found");
  }

  // Use the pre-populated customisations from locals (cached)
  const customisations = event.locals.customisations;
  const values = flattenCustomisation(customisations);

  const hasImages = {
    logo: !!customisations?.logo,
    logoDark: !!customisations?.logoDark,
    favicon: !!customisations?.favicon,
    faviconDark: !!customisations?.faviconDark,
  };

  return {
    values,
    hasImages,
  };
};

export const actions: Actions = {
  default: async (event) => {
    if (!event.locals.session || !hasAdminWriteAccess(event.locals.user?.adminRole ?? "none")) {
      console.error("Access denied to customise page (action)", {
        hasSession: !!event.locals.session,
        adminRole: event.locals.user?.adminRole,
      });
      return error(404, "Not found");
    }

    const formData = await event.request.formData();

    const data = Object.fromEntries(formData.entries());

    const logo = formData.get("logo");
    const logoDark = formData.get("logoDark");
    const favicon = formData.get("favicon");
    const faviconDark = formData.get("faviconDark");
    const removeLogo = formData.get("removeLogo") === "true";
    const removeLogoDark = formData.get("removeLogoDark") === "true";
    const removeFavicon = formData.get("removeFavicon") === "true";
    const removeFaviconDark = formData.get("removeFaviconDark") === "true";

    const validated = v.safeParse(updateCustomisationSchema, {
      ...data,
      logo,
      logoDark,
      favicon,
      faviconDark,
      ...(removeLogo ? { removeLogo: "true" } : {}),
      ...(removeLogoDark ? { removeLogoDark: "true" } : {}),
      ...(removeFavicon ? { removeFavicon: "true" } : {}),
      ...(removeFaviconDark ? { removeFaviconDark: "true" } : {}),
    });

    if (!validated.success) {
      const errors = v.flatten(validated.issues).nested;
      return fail(400, { values: data, errors });
    }

    try {
      const dbLogo = await processUploadedFile(logo);
      const dbLogoDark = await processUploadedFile(logoDark);
      const dbFavicon = await processUploadedFile(favicon);
      const dbFaviconDark = await processUploadedFile(faviconDark);

      const existing = await getCustomisations();

      const updateData = {
        accentColor: validated.output.accentColor || existing.accentColor,
        organizationName: {
          fi: validated.output.organizationNameFi,
          en: validated.output.organizationNameEn,
        },
        appName: { fi: validated.output.appNameFi, en: validated.output.appNameEn },
        businessId: validated.output.businessId || existing.businessId,
        overseerContact: validated.output.overseerContact || existing.overseerContact,
        overseerAddress: validated.output.overseerAddress || existing.overseerAddress,
        privacyPolicy: { fi: validated.output.privacyPolicyFi, en: validated.output.privacyPolicyEn },
        organizationRulesUrl: validated.output.organizationRulesUrl || existing.organizationRulesUrl,
        memberResignRule: validated.output.memberResignRule || existing.memberResignRule,
        memberResignDefaultReason: {
          fi: validated.output.memberResignDefaultReasonFi || existing.memberResignDefaultReason?.fi || "",
          en: validated.output.memberResignDefaultReasonEn || existing.memberResignDefaultReason?.en || "",
        },
        logo: dbLogo ?? (removeLogo ? null : existing.logo),
        logoDark: dbLogoDark ?? (removeLogoDark ? null : existing.logoDark),
        favicon: dbFavicon ?? (removeFavicon ? null : existing.favicon),
        faviconDark: dbFaviconDark ?? (removeFaviconDark ? null : existing.faviconDark),
        updatedAt: new Date(),
      };

      // Upsert logic: check if record with ID 1 exists
      const [record] = await db.select().from(table.appCustomisation).where(eq(table.appCustomisation.id, 1)).limit(1);

      await (record
        ? db.update(table.appCustomisation).set(updateData).where(eq(table.appCustomisation.id, 1))
        : db.insert(table.appCustomisation).values({
            id: 1,
            ...updateData,
          }));

      await updateCustomisationCache();
      event.locals.customisations = await getCustomisations();

      const LL = getLL(event.locals.locale);
      return { success: true, message: LL.admin.customise.success() };
    } catch (e) {
      console.error("Failed to update customisations", e);
      const LL = getLL(event.locals.locale);
      return fail(500, { message: LL.admin.customise.error() });
    }
  },
};
