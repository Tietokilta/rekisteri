import type { LayoutServerLoad } from "./$types";
import { getLayoutCustomizations } from "$lib/server/customization/utils";

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    customizations: getLayoutCustomizations(locals.customizations),
  };
};
