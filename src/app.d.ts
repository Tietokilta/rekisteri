// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    interface Locals {
      user: import("#lib/server/auth/session").SessionValidationResult["user"];
      session: import("#lib/server/auth/session").SessionValidationResult["session"];
      locale: import("#lib/i18n/routing.js").Locale;
      customizations: import("#lib/server/db/schema.js").AppCustomization;
      // Set by the OIDC login page: origins its consent forms may end up redirecting to
      oidcRedirectOrigins?: string[];
    }
  }
}

export {};
