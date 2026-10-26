import { defineEnvVars } from "@sveltejs/kit/env";

// SvelteKit only exposes declared variables. They pass through as-is (possibly undefined);
// validation happens in `#lib/env.ts` and `#lib/server/env.ts`.
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
  PUBLIC_URL: { public: true, schema: optional },
  PUBLIC_GIT_COMMIT_SHA: { public: true, static: true, schema: optional },
  NODE_ENV: { schema: optional },
  CI: { schema: optional },
  TEST: { schema: optional },
  UNSAFE_DISABLE_RATE_LIMITS: { schema: optional },
  DATABASE_URL: { schema: optional },
  STRIPE_API_KEY: { schema: optional },
  STRIPE_WEBHOOK_SECRET: { schema: optional },
  STRIPE_API_URL: { schema: optional },
  SMTP_HOST: { schema: optional },
  SMTP_PORT: { schema: optional },
  SMTP_USER: { schema: optional },
  SMTP_PASS: { schema: optional },
  SMTP_FROM: { schema: optional },
  PORT: { schema: optional },
  ADDRESS_HEADER: { schema: optional },
  RP_NAME: { schema: optional },
  RP_ID: { schema: optional },
  RP_ORIGIN: { schema: optional },
  OIDC_ENABLED: { schema: optional },
  OIDC_SIGNING_KEY_JWK: { schema: optional },
  OIDC_COOKIE_KEYS: { schema: optional },
});
