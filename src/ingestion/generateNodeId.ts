/**
 * Generate a unique node ID from file path and symbol path.
 *
 * Format: `{relativePath}:{symbolPath}`
 *
 * Examples:
 * - `src/utils.ts:formatDate`
 * - `src/models/user.ts:User`
 * - `src/models/user.ts:User.validate`
 * - `src/math.ts:add(number,number)` (overloads)
 *
 * @param filePath - Relative file path
 * @param symbolParts - Symbol path components (class, method, etc.)
 * @returns Unique node ID
 */
export const generateNodeId = (
	filePath: string,
	...symbolParts: string[]
): string => {
	// Normalize Windows paths to forward slashes
	const normalizedPath = filePath.replace(/\\/g, "/");

	if (symbolParts.length === 0) {
		return normalizedPath;
	}

	const symbolPath = symbolParts.join(".");
	return `${normalizedPath}:${symbolPath}`;
};
