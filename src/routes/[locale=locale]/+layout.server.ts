import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  const { logo, logoDark, favicon, faviconDark, ...safeCustomizations } = locals.customizations;
  const imageVersion = locals.customizations.updatedAt.getTime().toString(36);
  const logoUrl = logo ? `/api/image/logo.svg?v=${imageVersion}` : null;
  const logoDarkUrl = logoDark ? `/api/image/logo-dark.svg?v=${imageVersion}` : null;
  const faviconUrl = favicon ? `/api/image/favicon.png?v=${imageVersion}` : "/icon_light.png";
  const faviconDarkUrl = faviconDark ? `/api/image/favicon-dark.png?v=${imageVersion}` : "/icon_dark.png";

  return {
    customizations: {
      ...safeCustomizations,
      imageVersion,
      logoUrl,
      logoDarkUrl,
      faviconUrl,
      faviconDarkUrl,
    },
  };
};
