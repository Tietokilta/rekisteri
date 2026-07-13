// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    interface Locals {
      user: import("$lib/server/auth/session").SessionValidationResult["user"];
      session: import("$lib/server/auth/session").SessionValidationResult["session"];
      locale: import("$lib/i18n/routing").Locale;
      customizations: import("$lib/server/db/schema").AppCustomization;
    }
  }
}

export {};
