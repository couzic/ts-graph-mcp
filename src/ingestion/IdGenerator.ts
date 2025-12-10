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

/**
 * Parsed node ID components.
 */
export interface ParsedNodeId {
	/** Relative file path */
	filePath: string;
	/** Symbol path components */
	symbolPath: string[];
}

/**
 * Parse a node ID back into its components.
 *
 * @param nodeId - Node ID to parse
 * @returns Parsed components
 */
export const parseNodeId = (nodeId: string): ParsedNodeId => {
	// Handle Windows drive letters (e.g., C:/path/file.ts:symbol)
	// The colon after the drive letter should not be treated as a separator
	const colonIndex = findSymbolSeparatorIndex(nodeId);

	if (colonIndex === -1) {
		return {
			filePath: nodeId,
			symbolPath: [],
		};
	}

	const filePath = nodeId.slice(0, colonIndex);
	const symbolPart = nodeId.slice(colonIndex + 1);

	// Split symbol path on dots, but preserve dots inside parentheses (overloads)
	const symbolPath = splitSymbolPath(symbolPart);

	return {
		filePath,
		symbolPath,
	};
};

/**
 * Find the index of the colon that separates file path from symbol path.
 * Handles Windows drive letters like C:/
 */
const findSymbolSeparatorIndex = (nodeId: string): number => {
	// Look for .ts: or .tsx: or similar file extension followed by colon
	const extMatch = /\.(ts|tsx|js|jsx|mts|mjs|cts|cjs):/.exec(nodeId);
	if (extMatch) {
		return extMatch.index + extMatch[0].length - 1;
	}

	// Fallback: find last colon that's not part of a Windows drive (X:/)
	const lastColon = nodeId.lastIndexOf(":");
	if (lastColon === -1) return -1;

	// Check if this colon is a Windows drive letter
	const firstChar = nodeId[0];
	if (lastColon === 1 && firstChar && /^[A-Za-z]$/.test(firstChar)) {
		return -1;
	}

	return lastColon;
};

/**
 * Split symbol path on dots, preserving dots inside parentheses.
 */
const splitSymbolPath = (symbolPart: string): string[] => {
	if (!symbolPart) return [];

	const parts: string[] = [];
	let current = "";
	let parenDepth = 0;

	for (const char of symbolPart) {
		if (char === "(") {
			parenDepth++;
			current += char;
		} else if (char === ")") {
			parenDepth--;
			current += char;
		} else if (char === "." && parenDepth === 0) {
			if (current) parts.push(current);
			current = "";
		} else {
			current += char;
		}
	}

	if (current) parts.push(current);

	return parts;
};
