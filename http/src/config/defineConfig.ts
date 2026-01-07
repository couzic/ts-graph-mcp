import { type ProjectConfig, ProjectConfigSchema } from "./Config.schemas.js";

/**
 * Type-safe config helper for ts-graph-mcp.config.json files.
 * Validates config at runtime using Zod.
 *
 * @example
 * defineConfig({
 *   packages: [
 *     { name: "core", tsconfig: "./tsconfig.json" }
 *   ]
 * })
 */
export const defineConfig = (config: ProjectConfig): ProjectConfig => {
  return ProjectConfigSchema.parse(config);
};
