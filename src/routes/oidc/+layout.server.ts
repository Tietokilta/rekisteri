import { error } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { env } from "$lib/server/env";
import { getLayoutCustomizations } from "$lib/server/customization/utils";

// The OIDC login and error pages live outside the /{locale} routes, so oidc-provider's per-login
// interaction cookie (scoped to /oidc/login/{uid}) reaches them. The locale is picked in hooks.
export const load: LayoutServerLoad = async ({ locals }) => {
  if (!env.OIDC_ENABLED) error(404, "Not found");

  return {
    locale: locals.locale,
    customizations: getLayoutCustomizations(locals.customizations),
  };
};
