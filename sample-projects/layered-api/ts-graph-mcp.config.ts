import { defineConfig } from "../../src/config/defineConfig.js";

/**
 * ts-graph-mcp configuration for layered-api test project.
 *
 * This is an L1 structure: single module with single package.
 *
 * Tests:
 * - Multi-layer call chains (routes → controllers → services → repositories → db)
 * - Cross-service dependencies (OrderService → UserService)
 * - Path finding through architectural layers
 * - Neighborhood analysis around service layer
 */
export default defineConfig({
  modules: [
    {
      name: "api",
      packages: [
        {
          name: "main",
          tsconfig: "./tsconfig.json",
        },
      ],
    },
  ],
});
