/**
 * Adaptive snippet context calculation.
 *
 * Scales context lines based on result count to balance
 * context richness with output manageability.
 *
 * | Nodes | Context Lines | Behavior                    |
 * |-------|---------------|----------------------------:|
 * | 1-5   | 10            | Full context               |
 * | 6-25  | floor((25-x)/2) | Smooth curve: 10→0       |
 * | 26-35 | 0             | Call site only             |
 * | 36+   | null          | No snippets                |
 */

/** Threshold above which context lines become 0 (call site only) */
const CALL_SITE_ONLY_THRESHOLD = 25;

/** Threshold above which snippets are omitted entirely */
const NO_SNIPPET_THRESHOLD = 35;

/** Threshold for full context (10 lines) */
const FULL_CONTEXT_THRESHOLD = 5;

/** Context lines for small result sets */
const FULL_CONTEXT_LINES = 10;

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
