import type Database from "better-sqlite3";
import {
  attemptClassMethodFallback,
  formatDisambiguationMessage,
} from "../shared/classMethodFallback.js";
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
  /** The resolved node IDs (starting points, may be multiple for same-file coalescing) */
  resolvedNodeIds: string[];
  /** Whether the file path was auto-resolved (not provided by caller) */
  filePathWasResolved: boolean;
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
 * Shared traversal logic: resolve symbol, query edges, attempt class method fallback.
 */
const resolveAndTraverse = (
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
  queryEdges: (db: Database.Database, nodeId: string) => GraphEdgeWithCallSites[],
): TraversalQueryResult => {
  const resolution = resolveSymbol(db, filePath, symbol);
  if (!resolution.success) {
    return { success: false, error: resolution.error };
  }

  let resolvedNodeIds = resolution.nodeIds;
  let edges: GraphEdgeWithCallSites[] = [];
  for (const id of resolvedNodeIds) {
    edges.push(...queryEdges(db, id));
  }
  let message = resolution.message;
  const filePathWasResolved = resolution.filePathWasResolved ?? false;

  // If no edges found, attempt class method fallback per resolved node
  if (edges.length === 0) {
    for (const nodeId of resolvedNodeIds) {
      const fallback = attemptClassMethodFallback(db, nodeId);

      if (fallback.type === "multiple-methods") {
        // biome-ignore lint/style/noNonNullAssertion: split after includes check
        const className = symbol.includes(".") ? symbol.split(".")[0]! : symbol;
        const disambiguation = formatDisambiguationMessage(
          className,
          fallback.methods,
        );
        const error = message
          ? `${message}\n\n${disambiguation}`
          : disambiguation;
        return { success: false, error };
      }

      if (fallback.type === "single-method") {
        // biome-ignore lint/style/noNonNullAssertion: split after includes check
        const className = symbol.includes(".") ? symbol.split(".")[0]! : symbol;
        const fallbackMessage = `Resolved '${className}' to ${className}.${fallback.methodName}`;
        message = message
          ? `${message}\n\n${fallbackMessage}`
          : fallbackMessage;
        resolvedNodeIds = [fallback.methodId];
        edges = queryEdges(db, fallback.methodId);
        break;
      }
    }
  }

  const nodeIds = collectNodeIds(edges);

  return {
    success: true,
    edges,
    nodeIds,
    resolvedNodeIds,
    filePathWasResolved,
    message,
  };
};

/**
 * Query forward dependencies (raw edges, no formatting).
 * Use this when you need to filter edges before formatting.
 */
export const queryDependencies = (
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
): TraversalQueryResult =>
  resolveAndTraverse(db, filePath, symbol, queryDependencyEdges);

/**
 * Query reverse dependencies (raw edges, no formatting).
 * Use this when you need to filter edges before formatting.
 */
export const queryDependents = (
  db: Database.Database,
  filePath: string | undefined,
  symbol: string,
): TraversalQueryResult =>
  resolveAndTraverse(db, filePath, symbol, queryDependentEdges);
