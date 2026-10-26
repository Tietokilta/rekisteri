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
  plugins: [oidc, tailwindcss(), sveltekit(), kitRoutes<KIT_ROUTES>(), devtoolsJson()],
});
