import { defineConfig } from "../../src/config/ConfigSchema.js";

/**
 * Multi-module web app configuration for testing cross-module edge resolution.
 *
 * Structure:
 * - shared: Common types (User, Config) used by other modules
 * - frontend: UI components that import from shared
 * - backend: API handlers that import from shared
 *
 * This tests Issue #5 (cross-module edges). For a full monorepo test with
 * multiple packages per module, see PLANNED.md.
 */
export default defineConfig({
	modules: [
		{
			name: "shared",
			packages: [{ name: "shared", tsconfig: "./shared/tsconfig.json" }],
		},
		{
			name: "frontend",
			packages: [{ name: "frontend", tsconfig: "./frontend/tsconfig.json" }],
		},
		{
			name: "backend",
			packages: [{ name: "backend", tsconfig: "./backend/tsconfig.json" }],
		},
	],
});
