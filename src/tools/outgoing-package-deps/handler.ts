import type Database from "better-sqlite3";
import { formatText } from "./format.js";
import { queryPackageDeps } from "./query.js";

/**
 * Input parameters for outgoingPackageDeps tool.
 */
export interface OutgoingPackageDepsParams {
	package: string;
	module?: string;
	maxDepth?: number;
	outputTypes?: ("text" | "mermaid")[];
}

/**
 * MCP tool definition for outgoingPackageDeps.
 */
export const outgoingPackageDepsDefinition = {
	name: "outgoingPackageDeps",
	description:
		"Find package dependencies. Use this to answer 'What packages does this package depend on?' or 'What are the transitive dependencies?'",
	inputSchema: {
		type: "object" as const,
		properties: {
			package: {
				type: "string",
				description: "Package name (e.g., 'backend/api')",
			},
			module: {
				type: "string",
				description: "Narrow scope to a module",
			},
			maxDepth: {
				type: "number",
				description:
					"Traversal depth (1 = direct only, default = all reachable)",
				minimum: 1,
				maximum: 100,
			},
			outputTypes: {
				type: "array",
				description:
					"Output formats to include (default: ['text']). Use ['text', 'mermaid'] for diagram.",
				items: {
					type: "string",
					enum: ["text", "mermaid"],
				},
			},
		},
		required: ["package"],
	},
};

/**
 * Execute the outgoingPackageDeps tool.
 *
 * @param db - Database connection
 * @param params - Tool parameters
 * @returns Formatted string for LLM consumption
 */
export function executeOutgoingPackageDeps(
	db: Database.Database,
	params: OutgoingPackageDepsParams,
): string {
	// Parse package input (supports both "module/package" and "package" formats)
	const { module: moduleFilter, package: packageInput } = params;
	let targetModule: string;
	let targetPackage: string;

	if (packageInput.includes("/")) {
		const [mod, pkg] = packageInput.split("/");
		if (!mod || !pkg) {
			return `Error: Invalid package format "${packageInput}". Use "module/package" or "package".`;
		}
		targetModule = mod;
		targetPackage = pkg;
	} else {
		// Only package name provided
		if (!moduleFilter) {
			return `Error: Package "${packageInput}" requires a module filter. Use "module/package" format or provide module parameter.`;
		}
		targetModule = moduleFilter;
		targetPackage = packageInput;
	}

	// Verify package exists
	const checkSql =
		"SELECT 1 FROM nodes WHERE module = ? AND package = ? LIMIT 1";
	const exists = db.prepare(checkSql).get(targetModule, targetPackage);
	if (!exists) {
		return `Error: Package "${targetModule}/${targetPackage}" not found in database.`;
	}

	// Query dependencies
	const maxDepth = params.maxDepth ?? 100;
	const result = queryPackageDeps(db, targetModule, targetPackage, maxDepth);

	// Format output
	const outputTypes = params.outputTypes ?? ["text"];
	return formatText(targetModule, targetPackage, result, outputTypes);
}
