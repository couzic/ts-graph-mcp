import type Database from "better-sqlite3";

export interface ValidationError {
	valid: false;
	error: string;
}

export interface ValidationSuccess {
	valid: true;
}

export type ValidationResult = ValidationError | ValidationSuccess;

/**
 * Validates that a symbol exists in the database.
 * Returns a ValidationResult with an actionable error message if the symbol doesn't exist.
 */
export function validateSymbolExists(
	db: Database.Database,
	nodeId: string,
	paramName = "symbol",
): ValidationResult {
	const exists = db
		.prepare<[string], { found: 1 }>(
			"SELECT 1 as found FROM nodes WHERE id = ?",
		)
		.get(nodeId);

	if (!exists) {
		return {
			valid: false,
			error: `Symbol not found: ${nodeId}\n\nThe ${paramName} "${nodeId}" does not exist in the graph.\nUse search to find valid symbols.`,
		};
	}

	return { valid: true };
}

/**
 * Validates that a file exists in the database (has at least one node).
 * Returns a ValidationResult with an actionable error message if the file doesn't exist.
 */
export function validateFileExists(
	db: Database.Database,
	filePath: string,
): ValidationResult {
	const exists = db
		.prepare<[string], { found: 1 }>(
			"SELECT 1 as found FROM nodes WHERE file_path = ? LIMIT 1",
		)
		.get(filePath);

	if (!exists) {
		return {
			valid: false,
			error: `File not found: ${filePath}\n\nNo symbols found for file "${filePath}".\nCheck the path is relative (e.g., "src/utils.ts" not "./src/utils.ts").\nUse search with pattern "*" and filter by module/package to explore available files.`,
		};
	}

	return { valid: true };
}
