import { defineConfig } from "../../src/config/ConfigSchema.js";

/**
 * ts-graph-mcp configuration for monorepo test project.
 *
 * This is an L3 structure: 3 modules × 2 packages each = 6 packages total.
 *
 * Tests:
 * - Cross-package edges within same module (backend/api → backend/services)
 * - Cross-module edges between packages (backend/services → shared/types)
 * - Module + package filtering in queries
 */
export default defineConfig({
  modules: [
    {
      name: "shared",
      packages: [
        {
          name: "types",
          tsconfig: "./modules/shared/packages/types/tsconfig.json",
        },
        {
          name: "utils",
          tsconfig: "./modules/shared/packages/utils/tsconfig.json",
        },
      ],
    },
    {
      name: "frontend",
      packages: [
        {
          name: "ui",
          tsconfig: "./modules/frontend/packages/ui/tsconfig.json",
        },
        {
          name: "state",
          tsconfig: "./modules/frontend/packages/state/tsconfig.json",
        },
      ],
    },
    {
      name: "backend",
      packages: [
        {
          name: "api",
          tsconfig: "./modules/backend/packages/api/tsconfig.json",
        },
        {
          name: "services",
          tsconfig: "./modules/backend/packages/services/tsconfig.json",
        },
      ],
    },
  ],
});
