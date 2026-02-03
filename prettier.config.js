/** @type {import("prettier").Config & import ("prettier-plugin-svelte").PluginConfig & import("prettier-plugin-tailwindcss").PluginOptions} */
export default {
	useTabs: true,
	printWidth: 120,
	plugins: ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"],
	overrides: [
		{
			files: "*.svelte",
			options: {
				parser: "svelte",
			},
		},
	],
	tailwindStylesheet: "src/app.css",
};
