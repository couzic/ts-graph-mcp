import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "**/*e2e.test.ts"],
    globals: true,
    environment: "node",
  },
});
