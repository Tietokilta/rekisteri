import tailwindcss from "@tailwindcss/vite";
import { paraglideSveltekit } from "@inlang/paraglide-sveltekit";
import { sveltekit } from "@sveltejs/kit/vite";
import { kitRoutes } from "vite-plugin-kit-routes";
import { defineConfig } from "vite";
import type { KIT_ROUTES } from "$lib/ROUTES";

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		kitRoutes<KIT_ROUTES>(),
		paraglideSveltekit({
			project: "./project.inlang",
			outdir: "./src/lib/paraglide",
		}),
	],
});
