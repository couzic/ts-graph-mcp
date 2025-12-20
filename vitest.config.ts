import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [
			"src/**/*.test.ts",
			"sample-projects/**/*.test.ts",
		],
		globals: true,
		environment: "node",
	},
});
