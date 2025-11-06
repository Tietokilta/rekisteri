/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import devtoolsJson from "vite-plugin-devtools-json";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { kitRoutes } from "vite-plugin-kit-routes";
import type { KIT_ROUTES } from "$lib/ROUTES";

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), kitRoutes<KIT_ROUTES>(), devtoolsJson()],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: "./vite.config.ts",
				test: {
					name: "server",
					environment: "node",
					include: ["src/**/*.{test,spec}.{js,ts}"],
					exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
				},
			},
		],
	},
});
