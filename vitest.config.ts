import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Extends vite.config.ts so tests get the same SvelteKit options (remote functions, async Svelte)
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["tests/**/*.test.ts"],
      testTimeout: 60_000, // Testcontainers can be slow to start
      hookTimeout: 60_000,
      fileParallelism: false,
    },
  }),
);
