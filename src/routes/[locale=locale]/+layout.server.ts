import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.customisations) {
    return { customisations: null };
  }

  const { logo, logoDark, favicon, faviconDark, ...safeCustomisations } = locals.customisations;

  return {
    customisations: {
      ...safeCustomisations,
      logo: !!logo,
      logoDark: !!logoDark,
      favicon: !!favicon,
      faviconDark: !!faviconDark,
    },
  };
};
