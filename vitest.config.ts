import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import path from "node:path";

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      $lib: path.resolve("src/lib"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000, // Testcontainers can be slow to start
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
