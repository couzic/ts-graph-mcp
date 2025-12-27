/**
 * Adaptive snippet context calculation.
 *
 * Scales context lines based on result count to balance
 * context richness with output manageability.
 *
 * | Nodes | Context Lines | Behavior                    |
 * |-------|---------------|----------------------------|
 * | 1-5   | 10            | Full context               |
 * | 6-25  | floor((25-x)/2) | Smooth curve: 10→0       |
 * | 26-35 | 0             | Call site only             |
 * | 36-50 | null          | No snippets + message      |
 * | 50+   | null          | Truncated + message        |
 */

/** Maximum number of nodes before list is truncated */
export const MAX_NODES = 50;

/** Threshold above which snippets are omitted entirely */
export const NO_SNIPPET_THRESHOLD = 35;

/** Threshold above which context lines become 0 (call site only) */
export const CALL_SITE_ONLY_THRESHOLD = 25;

/** Threshold for full context (10 lines) */
export const FULL_CONTEXT_THRESHOLD = 5;

/** Context lines for small result sets */
export const FULL_CONTEXT_LINES = 10;

/**
 * Compute context lines based on node count.
 *
 * @param nodeCount - Number of nodes in the result
 * @returns Context lines to include around call sites, or null if no snippets
 */
export const computeContextLines = (nodeCount: number): number | null => {
  if (nodeCount <= 0) return null;
  if (nodeCount <= FULL_CONTEXT_THRESHOLD) return FULL_CONTEXT_LINES;
  if (nodeCount <= CALL_SITE_ONLY_THRESHOLD) {
    return Math.floor((CALL_SITE_ONLY_THRESHOLD - nodeCount) / 2);
  }
  if (nodeCount <= NO_SNIPPET_THRESHOLD) return 0;
  return null; // No snippets for 36+ nodes
};

/**
 * Determine if node list should be truncated.
 *
 * @param nodeCount - Number of nodes in the result
 * @returns true if list exceeds MAX_NODES
 */
export const shouldTruncateNodes = (nodeCount: number): boolean => {
  return nodeCount > MAX_NODES;
};

/**
 * Determine if snippets should be omitted entirely.
 *
 * @param nodeCount - Number of nodes in the result
 * @returns true if nodeCount exceeds NO_SNIPPET_THRESHOLD
 */
export const shouldOmitSnippets = (nodeCount: number): boolean => {
  return nodeCount > NO_SNIPPET_THRESHOLD;
};

/**
 * Get the appropriate message for the output based on node count.
 *
 * @param nodeCount - Number of nodes in the result
 * @returns Message to append to output, or undefined if none needed
 */
export const getAdaptiveMessage = (nodeCount: number): string | undefined => {
  if (nodeCount > MAX_NODES) {
    return `Note: Results truncated to ${MAX_NODES} nodes. Refine query with more specific symbol.`;
  }
  if (nodeCount > NO_SNIPPET_THRESHOLD) {
    return `Note: Snippets omitted (${nodeCount} nodes). Use Read tool with offset/limit shown above.`;
  }
  return undefined;
};
