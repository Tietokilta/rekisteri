import tailwindcss from "@tailwindcss/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import { kitRoutes } from "vite-plugin-kit-routes";
import { defineConfig } from "vite";
import type { KIT_ROUTES } from "$lib/ROUTES";
import type { Locale } from "$lib/paraglide/runtime";

type PageRoutes = keyof KIT_ROUTES["PAGES"];

const localizedPaths = {
	"/sign-in": {
		fi: "/kirjaudu-sisaan",
		en: "/sign-in",
	},
	"/sign-in/email": {
		fi: "/kirjaudu-sisaan/sahkoposti",
		en: "/sign-in/email",
	},
	"/admin/memberships": {
		fi: "/hallinta/jasenyydet",
		en: "/admin/memberships",
	},
	"/admin/members": {
		fi: "/hallinta/jasenet",
		en: "/admin/members",
	},
} as const satisfies Record<Exclude<PageRoutes, "/">, unknown /* inferred */>;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		kitRoutes<KIT_ROUTES>(),
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/lib/paraglide",
			strategy: ["url", "cookie", "baseLocale"],
			urlPatterns:
				// localized paths mapped from above
				Object.entries(localizedPaths)
					.map(([path, localized]) => ({
						pattern: path,
						localized: Object.entries(localized).map(
							([lang, localizedPath]) => [lang as Locale, `/${lang}${localizedPath}`] satisfies [Locale, string],
						),
					}))
					// Generic fallback
					.concat({
						pattern: "/:path(.*)?",
						localized: [
							["fi", "/fi/:path(.*)?"],
							["en", "/en/:path(.*)?"],
						],
					} as const),
		}),
	],
});
