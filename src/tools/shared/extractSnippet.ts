import { readFileSync } from "node:fs";

/**
 * A code snippet extracted from a source file.
 */
export interface Snippet {
	/** Line number where the call occurs (undefined = whole function body) */
	callSiteLine?: number;
	/** Start line of the snippet (1-indexed) */
	startLine: number;
	/** End line of the snippet (1-indexed) */
	endLine: number;
	/** The extracted code */
	code: string;
}

/**
 * Options for snippet extraction.
 */
export interface SnippetOptions {
	/** Lines of context before/after call site (default: 3) */
	contextLines?: number;
	/** Maximum snippets to return per caller (default: 3) */
	maxSnippets?: number;
	/** Maximum lines per snippet before truncation (default: 15) */
	maxSnippetLines?: number;
}

const DEFAULT_CONTEXT_LINES = 3;
const DEFAULT_MAX_SNIPPETS = 3;
const DEFAULT_MAX_SNIPPET_LINES = 15;

/**
 * Extract code snippets around specified call site line numbers.
 *
 * @param filePath - Absolute path to source file
 * @param callSites - Line numbers where calls occur (1-indexed)
 * @param options - Extraction options
 * @returns Array of code snippets, or empty array if file cannot be read
 */
export const extractSnippets = (
	filePath: string,
	callSites: number[],
	options: SnippetOptions = {},
): Snippet[] => {
	const {
		contextLines = DEFAULT_CONTEXT_LINES,
		maxSnippets = DEFAULT_MAX_SNIPPETS,
		maxSnippetLines = DEFAULT_MAX_SNIPPET_LINES,
	} = options;

	if (callSites.length === 0) {
		return [];
	}

	let content: string;
	try {
		content = readFileSync(filePath, "utf-8");
	} catch {
		// File not found or read error - return empty
		return [];
	}

	const lines = content.split("\n");
	const sortedSites = [...callSites].sort((a, b) => a - b);
	const snippets: Snippet[] = [];

	for (const site of sortedSites) {
		if (snippets.length >= maxSnippets) break;

		// Calculate context window (1-indexed to 0-indexed conversion)
		const startLine = Math.max(1, site - contextLines);
		const endLine = Math.min(lines.length, site + contextLines);

		// Check for overlap with previous snippet - merge if overlapping
		const prevSnippet = snippets[snippets.length - 1];
		if (prevSnippet && startLine <= prevSnippet.endLine + 1) {
			// Extend previous snippet instead of creating new one
			prevSnippet.endLine = endLine;
			const codeLines = lines.slice(prevSnippet.startLine - 1, endLine);
			prevSnippet.code = truncateCode(codeLines, maxSnippetLines);
			continue;
		}

		// Extract lines (1-indexed to 0-indexed)
		const codeLines = lines.slice(startLine - 1, endLine);
		const code = truncateCode(codeLines, maxSnippetLines);

		snippets.push({
			callSiteLine: site,
			startLine,
			endLine,
			code,
		});
	}

	return snippets;
};

/**
 * Truncate code if it exceeds max lines, keeping beginning and end.
 */
const truncateCode = (lines: string[], maxLines: number): string => {
	if (lines.length <= maxLines) {
		return lines.join("\n");
	}

	const half = Math.floor(maxLines / 2);
	const top = lines.slice(0, half);
	const bottom = lines.slice(-half);
	const omitted = lines.length - maxLines;

	return [...top, `  // ... ${omitted} lines omitted ...`, ...bottom].join(
		"\n",
	);
};

/**
 * Extract the whole function body as a single snippet.
 * Used for small functions (≤10 lines) to provide complete context.
 *
 * @param filePath - Absolute path to source file
 * @param startLine - Function start line (1-indexed)
 * @param endLine - Function end line (1-indexed)
 * @returns Single snippet with the whole function body, or null if file cannot be read
 */
export const extractFunctionBody = (
	filePath: string,
	startLine: number,
	endLine: number,
): Snippet | null => {
	let content: string;
	try {
		content = readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}

	const lines = content.split("\n");
	const codeLines = lines.slice(startLine - 1, endLine);

	return {
		// callSiteLine omitted = whole function body
		startLine,
		endLine,
		code: codeLines.join("\n"),
	};
};
