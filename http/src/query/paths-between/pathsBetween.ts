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

  let fromId = fromResolution.nodeId;
  let toId = toResolution.nodeId;
  const fromFilePathWasResolved = fromResolution.filePathWasResolved ?? false;
  const toFilePathWasResolved = toResolution.filePathWasResolved ?? false;

  const resolutionMessages: string[] = [];
  if (fromResolution.message) {
    resolutionMessages.push(fromResolution.message);
  }
  if (toResolution.message) {
    resolutionMessages.push(toResolution.message);
  }

  const fromFallback = attemptClassMethodFallback(db, fromId);
  if (fromFallback.type === "multiple-methods") {
    const className = from.symbol.includes(".")
      ? (from.symbol.split(".")[0] ?? from.symbol)
      : from.symbol;
    const prefix =
      resolutionMessages.length > 0
        ? `${resolutionMessages.join("\n")}\n\n`
        : "";
    return messageResult(
      prefix + formatDisambiguationMessage(className, fromFallback.methods),
    );
  }
  if (fromFallback.type === "single-method") {
    const className = from.symbol.includes(".")
      ? (from.symbol.split(".")[0] ?? from.symbol)
      : from.symbol;
    resolutionMessages.push(
      `Resolved '${className}' to ${className}.${fromFallback.methodName}`,
    );
    fromId = fromFallback.methodId;
  }

  const toFallback = attemptClassMethodFallback(db, toId);
  if (toFallback.type === "multiple-methods") {
    const className = to.symbol.includes(".")
      ? (to.symbol.split(".")[0] ?? to.symbol)
      : to.symbol;
    const prefix =
      resolutionMessages.length > 0
        ? `${resolutionMessages.join("\n")}\n\n`
        : "";
    return messageResult(
      prefix + formatDisambiguationMessage(className, toFallback.methods),
    );
  }
  if (toFallback.type === "single-method") {
    const className = to.symbol.includes(".")
      ? (to.symbol.split(".")[0] ?? to.symbol)
      : to.symbol;
    resolutionMessages.push(
      `Resolved '${className}' to ${className}.${toFallback.methodName}`,
    );
    toId = toFallback.methodId;
  }

  const resolutionPrefix =
    resolutionMessages.length > 0 ? resolutionMessages.join("\n") : undefined;

  if (fromId === toId) {
    const msg = "Invalid query: source and target are the same symbol.";
    return messageResult(
      resolutionPrefix ? `${resolutionPrefix}\n\n${msg}` : msg,
    );
  }

  let paths = queryPath(db, fromId, toId, { maxPaths: 1 });
  if (paths.length === 0) {
    paths = queryPath(db, toId, fromId, { maxPaths: 1 });
  }

  if (paths.length === 0) {
    const msg = "No path found.";
    return messageResult(
      resolutionPrefix ? `${resolutionPrefix}\n\n${msg}` : msg,
    );
  }

  const path = paths[0];
  if (!path) {
    const msg = "No path found.";
    return messageResult(
      resolutionPrefix ? `${resolutionPrefix}\n\n${msg}` : msg,
    );
  }

  const graphEdges: EdgeWithCallSites[] = path.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
    callSites: e.callSites,
  }));

  const aliasMap = queryAliasMap(db, path.nodes);
  const metadataByNodeId = queryNodeMetadata(db, path.nodes);

  const excludeIds = new Set<string>();
  if (!fromFilePathWasResolved) {
    excludeIds.add(fromId);
  }
  if (!toFilePathWasResolved) {
    excludeIds.add(toId);
  }

  const nodeIdsToQuery = path.nodes.filter((id) => !excludeIds.has(id));
  const nodes = queryNodeInfos(db, nodeIdsToQuery);

  return {
    edges: graphEdges,
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
