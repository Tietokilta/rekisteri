import prettier from "eslint-config-prettier";
import js from "@eslint/js";
import { includeIgnoreFile } from "@eslint/compat";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";
const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.strict,
	...svelte.configs["flat/recommended"],
	prettier,
	...svelte.configs["flat/prettier"],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	{
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
			// This is handled by `vite-plugin-kit-routes` for now
			// Will be replaced by SvelteKit's native solution once it covers same patterns
			"svelte/no-navigation-without-resolve": "off",
		},
	},
	{
		files: ["**/*.svelte"],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
			},
		},
	},
);
