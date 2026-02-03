import devtoolsJson from "vite-plugin-devtools-json";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { kitRoutes } from "vite-plugin-kit-routes";
import { defineConfig } from "vite";
import type { KIT_ROUTES } from "$lib/ROUTES";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), kitRoutes<KIT_ROUTES>(), devtoolsJson()],
});
