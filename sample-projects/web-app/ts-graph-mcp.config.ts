import { defineConfig } from "../../src/config/defineConfig.js";

/**
 * Web app configuration using flat packages format (no module nesting).
 *
 * Structure:
 * - shared: Common types (User, Config) used by other packages
 * - frontend: UI components that import from shared
 * - backend: API handlers that import from shared
 *
 * This tests cross-PACKAGE edges within a single implicit "main" module.
 * For cross-MODULE edge testing, see the monorepo sample project.
 */
export default defineConfig({
  packages: [
    { name: "shared", tsconfig: "./shared/tsconfig.json" },
    { name: "frontend", tsconfig: "./frontend/tsconfig.json" },
    { name: "backend", tsconfig: "./backend/tsconfig.json" },
  ],
});
