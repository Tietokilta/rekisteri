import prettier from "eslint-config-prettier";
import js from "@eslint/js";
import { includeIgnoreFile } from "@eslint/compat";
import svelte from "eslint-plugin-svelte";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";
const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

export default ts.config(
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  ...ts.configs.strict,
  ...svelte.configs["flat/recommended"],
  unicorn.configs["unopinionated"],
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
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: fileURLToPath(new URL(".", import.meta.url)),
      },
    },
    rules: {
      // TypeScript rules
      "@typescript-eslint/no-deprecated": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          disallowTypeAnnotations: false,
          fixStyle: "separate-type-imports",
        },
      ],
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

      // Prevent direct imports of SvelteKit env - use $lib/server/env instead
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["$env/dynamic/private"],
              message: "Import from '$lib/server/env' instead to use validated environment variables.",
            },
            {
              group: ["$env/dynamic/public"],
              message: "Import from '$lib/server/env' instead to use validated environment variables.",
            },
          ],
        },
      ],

      // Prevent direct access to process.env - use $lib/server/env instead
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Direct access to process.env is not allowed. Import from '$lib/server/env' instead for type-safe, validated environment variables.",
        },
      ],
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          disallowTypeAnnotations: false,
          fixStyle: "separate-type-imports",
        },
      ],
    },
  },
  {
    files: ["**/*.svelte.ts"],
    languageOptions: {
      parser: ts.parser,
    },
  },
  // Allow direct env access in specific files that need it
  {
    files: [
      "src/lib/env.ts",
      "src/lib/server/env.ts",
      "src/lib/server/db/seed.ts",
      "*.config.{js,ts}",
      "e2e/**/*.ts",
      "src/start-with-migrations.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },
  {
    files: ["src/lib/ROUTES.ts"],
    rules: {
      "unicorn/no-abusive-eslint-disable": "off",
    },
  },
);
