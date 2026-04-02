import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.customizations) {
    return { customizations: null };
  }

  const { logo, logoDark, favicon, faviconDark, ...safeCustomizations } = locals.customizations;

  return {
    customizations: {
      ...safeCustomizations,
      logo: !!logo,
      logoDark: !!logoDark,
      favicon: !!favicon,
      faviconDark: !!faviconDark,
    },
  };
};
