import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*e2e.test.ts"],
    exclude: ["node_modules"],
    globals: true,
    environment: "node",
    hookTimeout: 60000,
    testTimeout: 30000,
    maxWorkers: 4,
  },
});
