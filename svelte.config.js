import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { mdsvex } from "mdsvex";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: [
		vitePreprocess(),
		// @ts-expect-error mdsvex types are incompatible with latest svelte
		mdsvex({ extensions: [".md"] }),
	],

	extensions: [".svelte", ".md"],

	compilerOptions: {
		experimental: {
			async: true,
		},
		warningFilter: (warning) => {
			// Suppress warnings from SvelteKit generated files (upstream issue)
			if (warning.filename?.includes(".svelte-kit/generated")) {
				return false;
			}
			return true;
		},
	},

	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),

		csp: {
			mode: "auto",
			directives: {
				"default-src": ["self"],
				"script-src": ["self"],
				"style-src": ["self", "unsafe-inline"],
				"img-src": ["self", "data:", "https:"],
				"font-src": ["self", "data:"],
				"connect-src": ["self", "https://api.stripe.com"],
				"frame-src": ["https://js.stripe.com", "https://hooks.stripe.com"],
				"object-src": ["none"],
				"base-uri": ["self"],
				"form-action": ["self"],
				"frame-ancestors": ["none"],
			},
		},

		// CSRF protection enabled by default (checks origin)
		// Add domains to trustedOrigins if you need to allow specific external origins
		csrf: {
			trustedOrigins: [],
		},

		experimental: {
			remoteFunctions: true,
		},
	},
};

export default config;
