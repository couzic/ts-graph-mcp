import { EDGE_TYPES } from "@ts-graph/shared";
import type Database from "better-sqlite3";
import { attemptClassMethodFallback } from "../shared/classMethodFallback.js";
import { collectNodeIds } from "../shared/collectNodeIds.js";
import {
  type EdgeRowWithCallSites,
  type GraphEdgeWithCallSites,
  parseEdgeRows,
} from "../shared/parseEdgeRows.js";
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

/**
 * Filter edges to keep only those where both source and target are in the allowed set.
 */
export const filterEdgesByNodes = <
  T extends { source: string; target: string },
>(
  edges: T[],
  allowedNodeIds: Set<string>,
): T[] => {
  return edges.filter(
    (edge) =>
      allowedNodeIds.has(edge.source) && allowedNodeIds.has(edge.target),
  );
};

/**
 * Query edges between a set of nodes.
 * Returns edges where both source and target are in the provided set.
 */
export const queryEdgesBetweenNodes = (
  db: Database.Database,
  nodeIds: string[],
): GraphEdgeWithCallSites[] => {
  if (nodeIds.length === 0) {
    return [];
  }

  const placeholders = nodeIds.map(() => "?").join(", ");
  const edgeTypesPlaceholder = EDGE_TYPES.map(() => "?").join(", ");

  const sql = `
    SELECT source, target, type, call_sites FROM edges
    WHERE source IN (${placeholders})
      AND target IN (${placeholders})
      AND type IN (${edgeTypesPlaceholder})
  `;

  const params = [...nodeIds, ...nodeIds, ...EDGE_TYPES];
  const rows = db.prepare<unknown[], EdgeRowWithCallSites>(sql).all(...params);
  return parseEdgeRows(rows);
};
