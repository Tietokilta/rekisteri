import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      $lib: path.resolve("src/lib"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000, // Testcontainers can be slow to start
    hookTimeout: 60_000,
  },
});
