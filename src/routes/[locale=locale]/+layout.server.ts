import type { LayoutServerLoad } from "./$types";
import { getLayoutCustomizations } from "#lib/server/customization/utils.js";

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    customizations: getLayoutCustomizations(locals.customizations),
  };
};
