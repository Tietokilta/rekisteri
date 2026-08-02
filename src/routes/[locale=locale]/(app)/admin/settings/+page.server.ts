import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { flattenCustomization } from "$lib/server/customization/utils";
import { hasAdminAccess, hasAdminWriteAccess } from "$lib/shared/enums";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !hasAdminAccess(event.locals.user?.adminRole ?? "none")) {
    return error(404, "Not found");
  }

  // Use the pre-populated customizations from locals (cached)
  const customizations = event.locals.customizations;
  const values = flattenCustomization(customizations);

  const customImageExists = {
    logo: !!customizations.logo,
    logoDark: !!customizations.logoDark,
    favicon: !!customizations.favicon,
    faviconDark: !!customizations.faviconDark,
  };

  return {
    values,
    customImageExists,
    imageVersion: customizations.updatedAt.getTime().toString(36),
    canWrite: hasAdminWriteAccess(event.locals.user?.adminRole ?? "none"),
  };
};
