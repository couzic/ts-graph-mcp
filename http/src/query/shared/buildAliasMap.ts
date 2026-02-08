import { extractSymbol } from "./extractSymbol.js";
import type { GraphEdge } from "./GraphTypes.js";

/**
 * Build alias map from ALIAS_FOR edges targeting SyntheticType nodes.
 * Returns Map<syntheticName, aliasName> for display simplification.
 *
 * @example
 * buildAliasMap([{
 *   source: "src/s.ts:TypeAlias:Service",
 *   target: "src/s.ts:SyntheticType:ReturnType<typeof createService>",
 *   type: "ALIAS_FOR"
 * }]);
 * // Map { "ReturnType<typeof createService>" => "Service" }
 */
export const buildAliasMap = (edges: GraphEdge[]): Map<string, string> => {
  const aliasMap = new Map<string, string>();

  for (const edge of edges) {
    if (edge.type === "ALIAS_FOR" && edge.target.includes(":SyntheticType:")) {
      const syntheticName = extractSymbol(edge.target);
      const aliasName = extractSymbol(edge.source);
      aliasMap.set(syntheticName, aliasName);
    }
  }

  return aliasMap;
};
