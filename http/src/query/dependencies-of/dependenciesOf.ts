import type Database from "better-sqlite3";
import { queryDependencies } from "../search-graph/traverseGraph.js";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import { formatMcpFromResult } from "../shared/formatFromResult.js";
import { messageResult, type QueryResult } from "../shared/QueryResult.js";
import { queryAliasMap } from "../shared/queryAliasMap.js";
import { queryNodeInfos } from "../shared/queryNodeInfos.js";
import { queryNodeMetadata } from "../shared/queryNodeMetadata.js";

/**
 * Find all code that a symbol depends on (forward dependencies) — returns structured data.
 *
 * @spec tool::query.forward
 * @spec tool::resolve.method-fallback
 * @spec tool::resolve.class-disambiguation
 */
export const dependenciesData = (
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
  options: { maxNodes?: number } = {},
): QueryResult => {
  const result = queryDependencies(db, filePath, symbol);
  if (!result.success) {
    return messageResult(result.error);
  }

  if (result.edges.length === 0) {
    const noResults = "No dependencies found.";
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
 * Test-only convenience wrapper around `dependenciesData` + `formatMcpFromResult`.
 * Production code uses `dependenciesData` directly via `searchGraph`.
 */
export function dependenciesOf(
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
  options: { maxNodes?: number } = {},
): string {
  const result = dependenciesData(db, filePath, symbol, options);
  return formatMcpFromResult(result);
}
