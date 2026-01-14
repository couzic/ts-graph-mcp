import type { NodeType } from "../../db/Types.js";

export type DisplayNameContext = {
  typeByNodeId: Map<string, NodeType>;
  includesTargets: Set<string>;
};

/**
 * Format a symbol's display name based on its type and usage.
 *
 * - Functions/Methods: `name()`
 * - React components (INCLUDES targets): `&lt;Name&gt;` (HTML entities for Mermaid)
 * - Others: `name`
 *
 * @example
 * formatDisplayName("src/api.ts:handler", "handler", context);
 * // "handler()" if Function type
 * // "&lt;Button&gt;" if INCLUDES target
 */
export const formatDisplayName = (
  nodeId: string,
  baseName: string,
  context: DisplayNameContext,
): string => {
  const { typeByNodeId, includesTargets } = context;

  // React component (INCLUDES target) takes precedence
  // Use HTML entities for Mermaid compatibility
  if (includesTargets.has(nodeId)) {
    return `&lt;${baseName}&gt;`;
  }

  const nodeType = typeByNodeId.get(nodeId);

  // Function or Method: add parentheses
  if (nodeType === "Function" || nodeType === "Method") {
    return `${baseName}()`;
  }

  // Everything else: unchanged
  return baseName;
};
