import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "**/*e2e.test.ts", ".claude/worktrees/**"],
    testTimeout: 15000,
    hookTimeout: 15000,
    globals: true,
    environment: "node",
    maxWorkers: 8,
  },
});
