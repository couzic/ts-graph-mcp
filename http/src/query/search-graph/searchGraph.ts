import type Database from "better-sqlite3";
import type { EmbeddingProvider } from "../../embedding/EmbeddingTypes.js";
import type { SearchIndexWrapper } from "../../search/createSearchIndex.js";
import { dependenciesData } from "../dependencies-of/dependenciesOf.js";
import { dependentsData } from "../dependents-of/dependentsOf.js";
import { pathsBetweenData } from "../paths-between/pathsBetween.js";
import type { GraphEdgeWithCallSites } from "../shared/parseEdgeRows.js";
import { messageResult, type QueryResult } from "../shared/QueryResult.js";
import { connectSeeds } from "./connectSeeds.js";
import { buildFilteredTraversalResult } from "./formatFilteredTraversal.js";
import type { GraphEndpoint, SearchGraphInput } from "./SearchGraphTypes.js";
import { queryDependencies, queryDependents } from "./traverseGraph.js";

/**
 * Options for searchGraph including optional search index.
 */
export interface SearchGraphOptions {
  /** Maximum nodes to include in output */
  maxNodes?: number;
  /** Search index for semantic queries (optional - degrades gracefully if missing) */
  searchIndex?: SearchIndexWrapper;
  /** Embedding provider for hybrid/vector search */
  embeddingProvider: EmbeddingProvider;
}

/**
 * Resolved endpoint result.
 */
interface ResolvedEndpoint {
  symbol: string;
  file_path?: string;
}

const deduplicateEdges = (
  edges: GraphEdgeWithCallSites[],
): GraphEdgeWithCallSites[] => {
  const key = (e: GraphEdgeWithCallSites) =>
    `${e.source}->${e.target}:${e.type}`;
  return [...new Map(edges.map((e) => [key(e), e])).values()];
};

/**
 * Resolve a GraphEndpoint to symbol(s).
 * - `symbol` parameter: exact match, returns single result
 * - `query` parameter: lexical + semantic search, returns multiple results
 *
 * @returns Array of resolved endpoints (empty if not found)
 */
const resolveEndpoint = async (
  endpoint: GraphEndpoint | undefined,
  searchIndex: SearchIndexWrapper | undefined,
  embeddingProvider: EmbeddingProvider,
  limit = 10,
): Promise<ResolvedEndpoint[]> => {
  if (!endpoint) {
    return [];
  }

  // Exact symbol — returns single result
  if ("symbol" in endpoint) {
    return [{ symbol: endpoint.symbol, file_path: endpoint.file_path }];
  }

  // Query — lexical + semantic search, returns multiple results
  if (!searchIndex) {
    return [];
  }

  const vector = await embeddingProvider.embedQuery(endpoint.query);

  const results = await searchIndex.search(endpoint.query, {
    limit,
    vector,
  });

  if (results.length === 0) {
    return [];
  }

  return results.map((result) => ({
    symbol: result.symbol,
    file_path: result.file,
  }));
};

/**
 * Query dependencies for multiple from endpoints and merge results.
 * Used when from.query returns multiple matching symbols.
 */
const queryMultipleFromEndpoints = (
  db: Database.Database,
  endpoints: ResolvedEndpoint[],
  maxNodes?: number,
): QueryResult => {
  // Query edges for each endpoint
  const allEdges: GraphEdgeWithCallSites[] = [];

  for (const endpoint of endpoints) {
    const result = queryDependencies(db, endpoint.file_path, endpoint.symbol);
    if (result.success) {
      allEdges.push(...result.edges);
    }
  }

  const uniqueEdges = deduplicateEdges(allEdges);

  if (uniqueEdges.length === 0) {
    return messageResult("No dependencies found for matching symbols.");
  }

  return buildFilteredTraversalResult({
    db,
    edges: uniqueEdges,
    maxNodes,
  });
};

/**
 * Query paths between multiple from×to endpoint combinations and merge results.
 * Used when from.query and/or to.query resolve to multiple symbols.
 */
const queryMultiplePathsBetween = (
  db: Database.Database,
  fromEndpoints: ResolvedEndpoint[],
  toEndpoints: ResolvedEndpoint[],
  maxNodes?: number,
): QueryResult => {
  const allEdges: GraphEdgeWithCallSites[] = [];

  for (const from of fromEndpoints) {
    for (const to of toEndpoints) {
      const result = pathsBetweenData(
        db,
        { file_path: from.file_path, symbol: from.symbol },
        { file_path: to.file_path, symbol: to.symbol },
        { maxNodes },
      );
      if (result.edges) {
        allEdges.push(...result.edges);
      }
    }
  }

  const uniqueEdges = deduplicateEdges(allEdges);

  if (uniqueEdges.length === 0) {
    return messageResult("No paths found between matching symbols.");
  }

  return buildFilteredTraversalResult({
    db,
    edges: uniqueEdges,
    maxNodes,
  });
};

/**
 * Query dependents for multiple to endpoints and merge results.
 * Used when to.query returns multiple matching symbols.
 */
const queryMultipleToEndpoints = (
  db: Database.Database,
  endpoints: ResolvedEndpoint[],
  maxNodes?: number,
): QueryResult => {
  // Query edges for each endpoint
  const allEdges: GraphEdgeWithCallSites[] = [];

  for (const endpoint of endpoints) {
    const result = queryDependents(db, endpoint.file_path, endpoint.symbol);
    if (result.success) {
      allEdges.push(...result.edges);
    }
  }

  const uniqueEdges = deduplicateEdges(allEdges);

  if (uniqueEdges.length === 0) {
    return messageResult("No dependents found for matching symbols.");
  }

  return buildFilteredTraversalResult({
    db,
    edges: uniqueEdges,
    maxNodes,
  });
};

/**
 * Unified graph search tool that combines semantic search with graph traversal.
 *
 * @example
 * // What does handleRequest call?
 * searchGraph(db, { from: { symbol: "handleRequest" } })
 *
 * // Who calls saveUser?
 * searchGraph(db, { to: { symbol: "saveUser" } })
 *
 * // How does handleRequest reach saveUser?
 * searchGraph(db, {
 *   from: { symbol: "handleRequest" },
 *   to: { symbol: "saveUser" }
 * })
 */
/**
 * Type guard for topic-based search input.
 */
const isTopicSearch = (
  input: SearchGraphInput,
): input is { topic: string; max_nodes?: number } => "topic" in input;

export const searchGraph = async (
  db: Database.Database,
  input: SearchGraphInput,
  options: SearchGraphOptions,
): Promise<QueryResult> => {
  const maxNodes = input.max_nodes ?? options.maxNodes;
  const searchIndex = options.searchIndex;
  const embeddingProvider = options.embeddingProvider;

  // Case 0: Semantic search (topic only)
  if (isTopicSearch(input)) {
    if (!searchIndex) {
      return messageResult(
        "Semantic search requires embeddings. Run the server to enable semantic search.",
      );
    }

    const vector = await embeddingProvider.embedQuery(input.topic);

    const results = await searchIndex.search(input.topic, {
      limit: maxNodes ?? 50,
      vector,
    });

    if (results.length === 0) {
      return messageResult(`No symbols found matching topic: "${input.topic}"`);
    }

    const nodeIds = results.map((r) => r.id);
    const edges = connectSeeds(db, nodeIds);

    if (edges.length === 0) {
      const lines = results.map(
        (r) =>
          `${r.symbol} (${r.nodeType}) - ${r.file} [score: ${r.score.toFixed(3)}]`,
      );
      return messageResult(
        `## Symbols matching "${input.topic}"\n\nNo connections found between symbols.\n\n${lines.join("\n")}`,
      );
    }

    return buildFilteredTraversalResult({
      db,
      edges,
      maxNodes,
    });
  }

  // From here, input is { from?, to?, max_nodes? }
  const { from, to } = input;

  if (!from && !to) {
    return messageResult(
      "Error: At least one of 'topic', 'from', or 'to' is required.",
    );
  }

  // Query-based endpoints require search index
  if (((from && "query" in from) || (to && "query" in to)) && !searchIndex) {
    return messageResult(
      "Semantic search requires embeddings. Run the server to enable semantic search.",
    );
  }

  // Resolve endpoints
  const fromResolved = await resolveEndpoint(
    from,
    searchIndex,
    embeddingProvider,
  );
  const toResolved = await resolveEndpoint(to, searchIndex, embeddingProvider);

  // Case 1: Both from and to resolved → path finding
  if (fromResolved.length > 0 && toResolved.length > 0) {
    if (fromResolved.length > 1 || toResolved.length > 1) {
      return queryMultiplePathsBetween(db, fromResolved, toResolved, maxNodes);
    }
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    const f = fromResolved[0]!;
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    const t = toResolved[0]!;
    return pathsBetweenData(
      db,
      { file_path: f.file_path, symbol: f.symbol },
      { file_path: t.file_path, symbol: t.symbol },
      { maxNodes },
    );
  }

  // Case 2: Only from resolved → forward traversal
  if (fromResolved.length > 0) {
    if (fromResolved.length > 1 && from && "query" in from) {
      return queryMultipleFromEndpoints(db, fromResolved, maxNodes);
    }
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    const f = fromResolved[0]!;
    return dependenciesData(db, f.file_path, f.symbol, { maxNodes });
  }

  // Case 3: Only to resolved → backward traversal
  if (toResolved.length > 0) {
    if (toResolved.length > 1 && to && "query" in to) {
      return queryMultipleToEndpoints(db, toResolved, maxNodes);
    }
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    const t = toResolved[0]!;
    return dependentsData(db, t.file_path, t.symbol, { maxNodes });
  }

  // Query-based endpoints that resolved to nothing
  if (from && "query" in from) {
    return messageResult(
      `No symbols found matching query: "${from.query}". Try a more specific query or use Topic search.`,
    );
  }
  if (to && "query" in to) {
    return messageResult(
      `No symbols found matching query: "${to.query}". Try a more specific query or use Topic search.`,
    );
  }

  return messageResult(
    "Error: Invalid query. Provide either exact symbols or search queries.",
  );
};
