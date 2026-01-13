// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user: import("$lib/server/auth/session").SessionValidationResult["user"];
			session: import("$lib/server/auth/session").SessionValidationResult["session"];
			locale: import("$lib/i18n/routing").Locale;
		}
	}
}

declare module "*.svx" {
	import type { SvelteComponent } from "svelte";

	export default class Comp extends SvelteComponent {}

	export const metadata: Record<string, unknown>;
}

// eslint-disable-next-line unicorn/require-module-specifiers -- needed to make this a module
export {};
