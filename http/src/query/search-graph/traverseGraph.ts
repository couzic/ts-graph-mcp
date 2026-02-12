import type Database from "better-sqlite3";
import { attemptClassMethodFallback } from "../shared/classMethodFallback.js";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import type { GraphEdgeWithCallSites } from "../shared/parseEdgeRows.js";
import {
  queryDependencyEdges,
  queryDependentEdges,
} from "../shared/queryTraversalEdges.js";
import { resolveSymbol } from "../shared/symbolNotFound.js";

/**
 * Result of a raw graph traversal query.
 */
export interface TraversalResult {
  /** Whether the traversal succeeded */
  success: true;
  /** All edges in the traversal */
  edges: GraphEdgeWithCallSites[];
  /** All node IDs in the traversal (includes source/target) */
  nodeIds: string[];
  /** The resolved node ID (starting point) */
  nodeId: string;
  /** Optional resolution message (e.g., "Found X in Y") */
  message?: string;
}

/**
 * Error result when traversal fails.
 */
export interface TraversalError {
  success: false;
  error: string;
}

export type TraversalQueryResult = TraversalResult | TraversalError;

/**
 * Query forward dependencies (raw edges, no formatting).
 * Use this when you need to filter edges before formatting.
 */
export const queryDependencies = (
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
): TraversalQueryResult => {
  const resolution = resolveSymbol(db, filePath, symbol);
  if (!resolution.success) {
    return { success: false, error: resolution.error };
  }

  let nodeId = resolution.nodeId;
  let edges = queryDependencyEdges(db, nodeId);
  let message = resolution.message;

  // If no dependencies found, attempt class method fallback
  if (edges.length === 0) {
    const fallback = attemptClassMethodFallback(db, nodeId);

    if (fallback.type === "single-method") {
      // biome-ignore lint/style/noNonNullAssertion: split after includes check
      const className = symbol.includes(".") ? symbol.split(".")[0]! : symbol;
      const fallbackMessage = `Resolved '${className}' to ${className}.${fallback.methodName}`;
      message = message ? `${message}\n\n${fallbackMessage}` : fallbackMessage;
      nodeId = fallback.methodId;
      edges = queryDependencyEdges(db, nodeId);
    }
    // Note: multiple-methods case is not handled here - caller should handle disambiguation
  }

  const nodeIds = collectNodeIds(edges);

  return {
    success: true,
    edges,
    nodeIds,
    nodeId,
    message,
  };
};

/**
 * Query reverse dependencies (raw edges, no formatting).
 * Use this when you need to filter edges before formatting.
 */
export const queryDependents = (
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
): TraversalQueryResult => {
  const resolution = resolveSymbol(db, filePath, symbol);
  if (!resolution.success) {
    return { success: false, error: resolution.error };
  }

  let nodeId = resolution.nodeId;
  let edges = queryDependentEdges(db, nodeId);
  let message = resolution.message;

  // If no dependents found, attempt class method fallback
  if (edges.length === 0) {
    const fallback = attemptClassMethodFallback(db, nodeId);

    if (fallback.type === "single-method") {
      // biome-ignore lint/style/noNonNullAssertion: split after includes check
      const className = symbol.includes(".") ? symbol.split(".")[0]! : symbol;
      const fallbackMessage = `Resolved '${className}' to ${className}.${fallback.methodName}`;
      message = message ? `${message}\n\n${fallbackMessage}` : fallbackMessage;
      nodeId = fallback.methodId;
      edges = queryDependentEdges(db, nodeId);
    }
    // Note: multiple-methods case is not handled here - caller should handle disambiguation
  }

  const nodeIds = collectNodeIds(edges);

  return {
    success: true,
    edges,
    nodeIds,
    nodeId,
    message,
  };
};
