import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		testTimeout: 60_000, // Testcontainers can be slow to start
		hookTimeout: 60_000,
	},
});
