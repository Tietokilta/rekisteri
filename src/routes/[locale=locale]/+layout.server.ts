import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.customizations) {
    return { customizations: null };
  }

  const { logo, logoDark, favicon, faviconDark, ...safeCustomizations } = locals.customizations;
  const imageVersion = locals.customizations.updatedAt.getTime().toString(36);

  return {
    customizations: {
      ...safeCustomizations,
      imageVersion,
      logo: !!logo,
      logoDark: !!logoDark,
      favicon: !!favicon,
      faviconDark: !!faviconDark,
    },
  };
};
