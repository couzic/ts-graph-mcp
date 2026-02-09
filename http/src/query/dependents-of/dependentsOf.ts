import type Database from "better-sqlite3";
import {
  attemptClassMethodFallback,
  formatDisambiguationMessage,
} from "../shared/classMethodFallback.js";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import { formatQueryResult } from "../shared/formatFromResult.js";
import { messageResult, type QueryResult } from "../shared/QueryResult.js";
import type { QueryOptions } from "../shared/QueryTypes.js";
import { queryAliasMap } from "../shared/queryAliasMap.js";
import { queryNodeInfos } from "../shared/queryNodeInfos.js";
import { queryNodeMetadata } from "../shared/queryNodeMetadata.js";
import { queryDependentEdges } from "../shared/queryTraversalEdges.js";
import { resolveSymbol } from "../shared/symbolNotFound.js";

/**
 * Find all code that depends on a symbol (reverse dependencies) — returns structured data.
 */
export const dependentsData = (
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
  options: { maxNodes?: number } = {},
): QueryResult => {
  const resolution = resolveSymbol(db, filePath, symbol);
  if (!resolution.success) {
    return messageResult(resolution.error);
  }

  const nodeId = resolution.nodeId;
  const resolutionMessage = resolution.message;
  const filePathWasResolved = resolution.filePathWasResolved ?? false;

  let edges = queryDependentEdges(db, nodeId);
  let currentNodeId = nodeId;
  let fallbackMessage: string | undefined;

  if (edges.length === 0) {
    const fallback = attemptClassMethodFallback(db, nodeId);

    if (fallback.type === "single-method") {
      // biome-ignore lint/style/noNonNullAssertion: split after includes check
      const className = symbol.includes(".") ? symbol.split(".")[0]! : symbol;
      fallbackMessage = `Resolved '${className}' to ${className}.${fallback.methodName}`;
      currentNodeId = fallback.methodId;
      edges = queryDependentEdges(db, currentNodeId);
    } else if (fallback.type === "multiple-methods") {
      // biome-ignore lint/style/noNonNullAssertion: split after includes check
      const className = symbol.includes(".") ? symbol.split(".")[0]! : symbol;
      const disambiguation = formatDisambiguationMessage(
        className,
        fallback.methods,
      );
      return messageResult(
        resolutionMessage
          ? `${resolutionMessage}\n\n${disambiguation}`
          : disambiguation,
      );
    }
  }

  const combinedMessage = [resolutionMessage, fallbackMessage]
    .filter(Boolean)
    .join("\n\n");

  if (edges.length === 0) {
    const noResults = "No dependents found.";
    return messageResult(
      combinedMessage ? `${combinedMessage}\n\n${noResults}` : noResults,
    );
  }

  const nodeIds = collectNodeIds(edges);
  const aliasMap = queryAliasMap(db, nodeIds);
  const metadataByNodeId = queryNodeMetadata(db, nodeIds);

  const nodeIdsToQuery = filePathWasResolved
    ? nodeIds
    : nodeIds.filter((id) => id !== currentNodeId);
  const nodes = queryNodeInfos(db, nodeIdsToQuery);

  return {
    edges,
    nodes,
    aliasMap,
    metadataByNodeId,
    maxNodes: options.maxNodes,
    message: combinedMessage || undefined,
  };
};

/**
 * Test-only convenience wrapper around `dependentsData` + `formatQueryResult`.
 * Production code uses `dependentsData` directly via `searchGraph`.
 */
export function dependentsOf(
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
  options: QueryOptions = {},
): string {
  const result = dependentsData(db, filePath, symbol, options);
  return formatQueryResult(result, options.format);
}
