import type Database from "better-sqlite3";
import { formatIncomingPackageDeps } from "./format.js";
import { queryIncomingPackageDeps } from "./query.js";

/**
 * Input parameters for incomingPackageDeps tool.
 */
export interface IncomingPackageDepsParams {
	package: string;
	module?: string;
	maxDepth?: number;
	outputTypes?: ("text" | "mermaid")[];
}

/**
 * MCP tool definition for incomingPackageDeps.
 */
export const incomingPackageDepsDefinition = {
	name: "incomingPackageDeps",
	description:
		"Find reverse package dependencies. Use this to answer 'What packages depend on this package?' or 'What would break if I changed this package?'",
	inputSchema: {
		type: "object" as const,
		properties: {
			package: {
				type: "string",
				description: "Package name (e.g., 'shared/types')",
			},
			module: {
				type: "string",
				description: "Narrow scope to a module",
			},
			maxDepth: {
				type: "number",
				description:
					"Traversal depth: 1 = direct dependents only, default = all reachable",
			},
			outputTypes: {
				type: "array",
				items: {
					type: "string",
					enum: ["text", "mermaid"],
				},
				description: "Output formats to include (default: ['text'])",
			},
		},
		required: ["package"],
	},
};

/**
 * Execute the incomingPackageDeps tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeIncomingPackageDeps(
	db: Database.Database,
	params: IncomingPackageDepsParams,
): string {
	const maxDepth = params.maxDepth ?? 100;
	const outputTypes = params.outputTypes ?? ["text"];

	// Parse package name: "module/package" or just "package"
	const packageName = params.package;
	let moduleFilter: string | undefined = params.module;
	let pkgFilter: string;

	if (packageName.includes("/")) {
		const [mod, pkg] = packageName.split("/");
		moduleFilter = moduleFilter ?? mod;
		pkgFilter = pkg || packageName;
	} else {
		pkgFilter = packageName;
	}

	// Query package dependencies
	const result = queryIncomingPackageDeps(db, {
		module: moduleFilter,
		package: pkgFilter,
		maxDepth,
	});

	// Check if target package exists
	if (!result.centerExists) {
		return `error: package not found\npackage: ${packageName}\n\nNo files found in this package. Check the package name and try again.`;
	}

	// Format output
	return formatIncomingPackageDeps(result, outputTypes);
}
