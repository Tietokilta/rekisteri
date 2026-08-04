import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000, // Testcontainers can be slow to start
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
