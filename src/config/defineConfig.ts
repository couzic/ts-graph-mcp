import {
	type ProjectConfig,
	type ProjectConfigInput,
	ProjectConfigInputSchema,
} from "./Config.schemas.js";

/**
 * Normalizes flat package format to full module format.
 * Flat format creates an implicit "main" module containing all packages.
 */
export const normalizeConfig = (input: ProjectConfigInput): ProjectConfig => {
	if ("modules" in input) {
		return input;
	}
	// Flat format: create implicit "main" module
	return {
		modules: [{ name: "main", packages: input.packages }],
		storage: input.storage,
		watch: input.watch,
	};
};

/**
 * Type-safe config helper for ts-graph-mcp.config.ts files.
 * Validates config at runtime using Zod.
 *
 * Accepts two formats:
 * 1. Full format: `{ modules: [{ name: "...", packages: [...] }] }`
 * 2. Flat format: `{ packages: [...] }` (creates implicit "main" module)
 *
 * @param config - Project configuration (full or flat format)
 * @returns Validated configuration (always in full format)
 * @throws ZodError if validation fails
 */
export const defineConfig = (config: ProjectConfigInput): ProjectConfig => {
	const parsed = ProjectConfigInputSchema.parse(config);
	return normalizeConfig(parsed);
};
