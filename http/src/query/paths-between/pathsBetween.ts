import type Database from "better-sqlite3";
import {
  attemptClassMethodFallback,
  formatDisambiguationMessage,
} from "../shared/classMethodFallback.js";
import { formatMcpFromResult } from "../shared/formatFromResult.js";
import type { EdgeWithCallSites } from "../shared/formatToolOutput.js";
import { messageResult, type QueryResult } from "../shared/QueryResult.js";
import { queryAliasMap } from "../shared/queryAliasMap.js";
import { queryNodeInfos } from "../shared/queryNodeInfos.js";
import { queryNodeMetadata } from "../shared/queryNodeMetadata.js";
import { resolveSymbol } from "../shared/symbolNotFound.js";
import { queryPath } from "./query.js";

export interface SymbolRef {
  file_path: string | undefined;
  symbol: string;
}

/**
 * Find how two symbols connect — returns structured data.
 *
 * @spec tool::query.path
 */
export const pathsBetweenData = (
  db: Database.Database,
  from: SymbolRef,
  to: SymbolRef,
  options: { maxNodes?: number } = {},
): QueryResult => {
  const fromResolution = resolveSymbol(db, from.file_path, from.symbol);
  if (!fromResolution.success) {
    return messageResult(fromResolution.error);
  }

  const toResolution = resolveSymbol(db, to.file_path, to.symbol);
  if (!toResolution.success) {
    return messageResult(toResolution.error);
  }

  let fromNodeIds = fromResolution.nodeIds;
  let toNodeIds = toResolution.nodeIds;
  const fromFilePathWasResolved = fromResolution.filePathWasResolved ?? false;
  const toFilePathWasResolved = toResolution.filePathWasResolved ?? false;

  const resolutionMessages: string[] = [];
  if (fromResolution.message) {
    resolutionMessages.push(fromResolution.message);
  }
  if (toResolution.message) {
    resolutionMessages.push(toResolution.message);
  }

  // Class method fallback for from nodes
  for (const fromId of fromNodeIds) {
    const fallback = attemptClassMethodFallback(db, fromId);
    if (fallback.type === "multiple-methods") {
      const className = from.symbol.includes(".")
        ? (from.symbol.split(".")[0] ?? from.symbol)
        : from.symbol;
      const prefix =
        resolutionMessages.length > 0
          ? `${resolutionMessages.join("\n")}\n\n`
          : "";
      return messageResult(
        prefix + formatDisambiguationMessage(className, fallback.methods),
      );
    }
    if (fallback.type === "single-method") {
      const className = from.symbol.includes(".")
        ? (from.symbol.split(".")[0] ?? from.symbol)
        : from.symbol;
      resolutionMessages.push(
        `Resolved '${className}' to ${className}.${fallback.methodName}`,
      );
      fromNodeIds = [fallback.methodId];
      break;
    }
  }

  // Class method fallback for to nodes
  for (const toId of toNodeIds) {
    const fallback = attemptClassMethodFallback(db, toId);
    if (fallback.type === "multiple-methods") {
      const className = to.symbol.includes(".")
        ? (to.symbol.split(".")[0] ?? to.symbol)
        : to.symbol;
      const prefix =
        resolutionMessages.length > 0
          ? `${resolutionMessages.join("\n")}\n\n`
          : "";
      return messageResult(
        prefix + formatDisambiguationMessage(className, fallback.methods),
      );
    }
    if (fallback.type === "single-method") {
      const className = to.symbol.includes(".")
        ? (to.symbol.split(".")[0] ?? to.symbol)
        : to.symbol;
      resolutionMessages.push(
        `Resolved '${className}' to ${className}.${fallback.methodName}`,
      );
      toNodeIds = [fallback.methodId];
      break;
    }
  }

  const resolutionPrefix =
    resolutionMessages.length > 0 ? resolutionMessages.join("\n") : undefined;

  // Try all from×to combinations
  const allEdges: EdgeWithCallSites[] = [];
  const allPathNodes: string[] = [];

  for (const fromId of fromNodeIds) {
    for (const toId of toNodeIds) {
      if (fromId === toId) {
        continue;
      }

      let paths = queryPath(db, fromId, toId, { maxPaths: 1 });
      if (paths.length === 0) {
        paths = queryPath(db, toId, fromId, { maxPaths: 1 });
      }

      const path = paths[0];
      if (path) {
        for (const e of path.edges) {
          allEdges.push({
            source: e.source,
            target: e.target,
            type: e.type,
            callSites: e.callSites,
          });
        }
        allPathNodes.push(...path.nodes);
      }
    }
  }

  // Check if all combinations were same-symbol
  if (
    fromNodeIds.length === 1 &&
    toNodeIds.length === 1 &&
    fromNodeIds[0] === toNodeIds[0]
  ) {
    const msg = "Invalid query: source and target are the same symbol.";
    return messageResult(
      resolutionPrefix ? `${resolutionPrefix}\n\n${msg}` : msg,
    );
  }

  if (allEdges.length === 0) {
    const msg = "No path found.";
    return messageResult(
      resolutionPrefix ? `${resolutionPrefix}\n\n${msg}` : msg,
    );
  }

  const uniquePathNodes = [...new Set(allPathNodes)];
  const aliasMap = queryAliasMap(db, uniquePathNodes);
  const metadataByNodeId = queryNodeMetadata(db, uniquePathNodes);

  const excludeIds = new Set<string>();
  if (!fromFilePathWasResolved) {
    for (const id of fromNodeIds) {
      excludeIds.add(id);
    }
  }
  if (!toFilePathWasResolved) {
    for (const id of toNodeIds) {
      excludeIds.add(id);
    }
  }

  const nodeIdsToQuery = uniquePathNodes.filter((id) => !excludeIds.has(id));
  const nodes = queryNodeInfos(db, nodeIdsToQuery);

  return {
    edges: allEdges,
    nodes,
    aliasMap,
    metadataByNodeId,
    maxNodes: options.maxNodes,
    message: resolutionPrefix,
  };
};

/**
 * Test-only convenience wrapper around `pathsBetweenData` + `formatMcpFromResult`.
 * Production code uses `pathsBetweenData` directly via `searchGraph`.
 */
export function pathsBetween(
  db: Database.Database,
  from: SymbolRef,
  to: SymbolRef,
  options: { maxNodes?: number } = {},
): string {
  const result = pathsBetweenData(db, from, to, options);
  return formatMcpFromResult(result);
}
