import type Database from "better-sqlite3";
import { queryDependents } from "../search-graph/traverseGraph.js";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import { formatMcpFromResult } from "../shared/formatFromResult.js";
import { messageResult, type QueryResult } from "../shared/QueryResult.js";
import { queryAliasMap } from "../shared/queryAliasMap.js";
import { queryNodeInfos } from "../shared/queryNodeInfos.js";
import { queryNodeMetadata } from "../shared/queryNodeMetadata.js";

/**
 * Find all code that depends on a symbol (reverse dependencies) — returns structured data.
 *
 * @spec tool::query.backward
 * @spec tool::resolve.method-fallback
 * @spec tool::resolve.class-disambiguation
 */
export const dependentsData = (
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
  options: { maxNodes?: number } = {},
): QueryResult => {
  const result = queryDependents(db, filePath, symbol);
  if (!result.success) {
    return messageResult(result.error);
  }

  if (result.edges.length === 0) {
    const noResults = "No dependents found.";
    return messageResult(
      result.message ? `${result.message}\n\n${noResults}` : noResults,
    );
  }

  const nodeIds = collectNodeIds(result.edges);
  const aliasMap = queryAliasMap(db, nodeIds);
  const metadataByNodeId = queryNodeMetadata(db, nodeIds);

  const excludeIds = new Set(result.resolvedNodeIds);
  const nodeIdsToQuery = result.filePathWasResolved
    ? nodeIds
    : nodeIds.filter((id) => !excludeIds.has(id));
  const nodes = queryNodeInfos(db, nodeIdsToQuery);

  return {
    edges: result.edges,
    nodes,
    aliasMap,
    metadataByNodeId,
    maxNodes: options.maxNodes,
    message: result.message,
  };
};

/**
 * Test-only convenience wrapper around `dependentsData` + `formatMcpFromResult`.
 * Production code uses `dependentsData` directly via `searchGraph`.
 */
export function dependentsOf(
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
  options: { maxNodes?: number } = {},
): string {
  const result = dependentsData(db, filePath, symbol, options);
  return formatMcpFromResult(result);
}
