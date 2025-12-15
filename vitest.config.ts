import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [
			"src/**/*.test.ts",
			"test-projects/**/*.test.ts",
		],
		globals: true,
		environment: "node",
	},
});
