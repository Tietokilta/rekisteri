import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import devtoolsJson from "vite-plugin-devtools-json";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { kitRoutes } from "vite-plugin-kit-routes";
import { defineConfig, type Plugin } from "vite";
import type { KIT_ROUTES } from "$lib/ROUTES";
import { hasOidcProvider, isOidcPath, oidcMiddleware } from "./src/oidc-mount.ts";

// Serves OIDC protocol endpoints in `vite dev` and `vite preview`, like start-with-migrations.ts does in production
const oidc: Plugin = {
  name: "rekisteri-oidc",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      // In dev, SvelteKit runs the `init` hook (which creates the provider) on its first request
      if (isOidcPath(req.url) && !hasOidcProvider()) {
        try {
          await fetch(`http://${req.headers.host}/`);
        } catch {
          // Only a warm-up; the provider exists afterwards even if the page itself failed
        }
      }
      oidcMiddleware(req, res, next);
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use(oidcMiddleware);
  },
};

export default defineConfig({
  plugins: [
    oidc,
    tailwindcss(),
    sveltekit({
      // Consult https://svelte.dev/docs/kit/integrations
      // for more information about preprocessors
      preprocess: [vitePreprocess()],
      extensions: [".svelte"],
      compilerOptions: { experimental: { async: true } },
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
          "worker-src": ["self", "blob:"],
          "object-src": ["none"],
          "base-uri": ["self"],
          "form-action": ["self"],
          "frame-ancestors": ["none"],
        },
      },
      // CSRF protection enabled by default (checks origin)
      // Add domains to trustedOrigins if you need to allow specific external origins
      csrf: { trustedOrigins: [] },
      experimental: { remoteFunctions: true },
    }),
    kitRoutes<KIT_ROUTES>(),
    devtoolsJson(),
  ],
});
