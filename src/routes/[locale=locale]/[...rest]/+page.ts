import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

// Unknown paths under a valid locale would otherwise fall through to SvelteKit's bare root 404 page.
// Rest params have the lowest priority, so this never shadows a real route.
export const load: PageLoad = () => {
  error(404, "Not Found");
};
