import type Database from "better-sqlite3";
import type { EmbeddingProvider } from "../../embedding/EmbeddingTypes.js";
import type { SearchIndexWrapper } from "../../search/createSearchIndex.js";
import type { SearchMode } from "../../search/SearchTypes.js";
import { dependenciesOf } from "../dependencies-of/dependenciesOf.js";
import { dependentsOf } from "../dependents-of/dependentsOf.js";
import { pathsBetween } from "../paths-between/pathsBetween.js";
import type { GraphEdgeWithCallSites } from "../shared/parseEdgeRows.js";
import type { QueryOptions } from "../shared/QueryTypes.js";
import {
  filterEdgesToTopicRelevant,
  filterNodesByTopic,
} from "./filterByTopic.js";
import { formatFilteredTraversal } from "./formatFilteredTraversal.js";
import type { GraphEndpoint, SearchGraphInput } from "./SearchGraphTypes.js";
import {
  queryDependencies,
  queryDependents,
  queryEdgesBetweenNodes,
} from "./traverseGraph.js";

/**
 * Options for searchGraph including optional search index.
 */
export interface SearchGraphOptions extends QueryOptions {
  /** Search index for semantic queries (optional - degrades gracefully if missing) */
  searchIndex?: SearchIndexWrapper;
  /** Embedding provider for hybrid search (optional - falls back to fulltext if missing) */
  embeddingProvider?: EmbeddingProvider;
}

/**
 * Determine search mode and get query vector if hybrid search is available.
 */
const getSearchConfig = async (
  query: string,
  searchIndex: SearchIndexWrapper,
  embeddingProvider?: EmbeddingProvider,
): Promise<{ mode: SearchMode; vector?: number[] }> => {
  if (searchIndex.supportsVectors && embeddingProvider?.ready) {
    const vector = await embeddingProvider.embedQuery(query);
    return { mode: "hybrid", vector };
  }
  return { mode: "fulltext" };
};

/**
 * Resolved endpoint result.
 */
interface ResolvedEndpoint {
  symbol: string;
  file_path?: string;
}

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
  embeddingProvider?: EmbeddingProvider,
  limit = 10,
): Promise<ResolvedEndpoint[]> => {
  if (!endpoint) {
    return [];
  }

  // Exact symbol takes precedence - returns single result
  if (endpoint.symbol) {
    return [{ symbol: endpoint.symbol, file_path: endpoint.file_path }];
  }

  // Query performs lexical + semantic search - returns multiple results
  if (endpoint.query) {
    if (!searchIndex) {
      return [];
    }

    const searchConfig = await getSearchConfig(
      endpoint.query,
      searchIndex,
      embeddingProvider,
    );

    const results = await searchIndex.search(endpoint.query, {
      limit,
      ...searchConfig,
    });

    if (results.length === 0) {
      return [];
    }

    // Return all matching results
    return results.map((result) => ({
      symbol: result.symbol,
      file_path: result.file,
    }));
  }

  return [];
};

/**
 * Query dependencies for multiple from endpoints and merge results.
 * Used when from.query returns multiple matching symbols.
 */
const queryMultipleFromEndpoints = (
  db: Database.Database,
  projectRoot: string,
  endpoints: ResolvedEndpoint[],
  maxNodes?: number,
): string => {
  // Query edges for each endpoint
  const allEdges: GraphEdgeWithCallSites[] = [];

  for (const endpoint of endpoints) {
    const result = queryDependencies(db, endpoint.file_path, endpoint.symbol);
    if (result.success) {
      allEdges.push(...result.edges);
    }
  }

  // Deduplicate edges
  const edgeKey = (e: GraphEdgeWithCallSites) =>
    `${e.source}->${e.target}:${e.type}`;
  const uniqueEdges = [
    ...new Map(allEdges.map((e) => [edgeKey(e), e])).values(),
  ];

  if (uniqueEdges.length === 0) {
    return "No dependencies found for matching symbols.";
  }

  return formatFilteredTraversal({
    db,
    projectRoot,
    edges: uniqueEdges,
    startNodeId: "", // No single start - include all
    maxNodes,
  });
};

/**
 * Query dependents for multiple to endpoints and merge results.
 * Used when to.query returns multiple matching symbols.
 */
const queryMultipleToEndpoints = (
  db: Database.Database,
  projectRoot: string,
  endpoints: ResolvedEndpoint[],
  maxNodes?: number,
): string => {
  // Query edges for each endpoint
  const allEdges: GraphEdgeWithCallSites[] = [];

  for (const endpoint of endpoints) {
    const result = queryDependents(db, endpoint.file_path, endpoint.symbol);
    if (result.success) {
      allEdges.push(...result.edges);
    }
  }

  // Deduplicate edges
  const edgeKey = (e: GraphEdgeWithCallSites) =>
    `${e.source}->${e.target}:${e.type}`;
  const uniqueEdges = [
    ...new Map(allEdges.map((e) => [edgeKey(e), e])).values(),
  ];

  if (uniqueEdges.length === 0) {
    return "No dependents found for matching symbols.";
  }

  return formatFilteredTraversal({
    db,
    projectRoot,
    edges: uniqueEdges,
    startNodeId: "", // No single start - include all
    maxNodes,
  });
};

/**
 * Traverse the graph and filter results by topic relevance.
 */
const traverseWithTopicFilter = async (
  db: Database.Database,
  projectRoot: string,
  direction: "dependencies" | "dependents",
  filePath: string | undefined,
  symbol: string,
  topic: string,
  searchIndex: SearchIndexWrapper,
  embeddingProvider?: EmbeddingProvider,
  maxNodes?: number,
): Promise<string> => {
  // Query raw edges
  const queryResult =
    direction === "dependencies"
      ? queryDependencies(db, filePath, symbol)
      : queryDependents(db, filePath, symbol);

  if (!queryResult.success) {
    return queryResult.error;
  }

  const { edges, nodeIds, nodeId, message } = queryResult;

  if (edges.length === 0) {
    const noResults = `No ${direction} found.`;
    return message ? `${message}\n\n${noResults}` : noResults;
  }

  // Find topic-relevant nodes
  const { topicRelevantNodes } = await filterNodesByTopic(
    nodeIds,
    topic,
    searchIndex,
    embeddingProvider,
  );

  // Filter edges to keep only those leading to topic-relevant targets
  const filteredEdges = filterEdgesToTopicRelevant(
    edges,
    topicRelevantNodes,
    nodeId,
  );

  if (filteredEdges.length === 0) {
    const noResults = `No ${direction} found matching topic "${topic}".`;
    return message ? `${message}\n\n${noResults}` : noResults;
  }

  // Format the filtered result
  return formatFilteredTraversal({
    db,
    projectRoot,
    edges: filteredEdges,
    startNodeId: nodeId,
    maxNodes,
    prependMessage: message,
  });
};

/**
 * Unified graph search tool that combines semantic search with graph traversal.
 *
 * Query patterns:
 * - `{ from: { symbol: "X" } }` → forward traversal (what does X depend on?)
 * - `{ to: { symbol: "X" } }` → backward traversal (who depends on X?)
 * - `{ from: { symbol: "A" }, to: { symbol: "B" } }` → path finding (how does A reach B?)
 * - `{ topic: "validation" }` → semantic search for related symbols
 *
 * @example
 * // What does handleRequest call?
 * searchGraph(db, projectRoot, { from: { symbol: "handleRequest" } })
 *
 * // Who calls saveUser?
 * searchGraph(db, projectRoot, { to: { symbol: "saveUser" } })
 *
 * // How does handleRequest reach saveUser?
 * searchGraph(db, projectRoot, {
 *   from: { symbol: "handleRequest" },
 *   to: { symbol: "saveUser" }
 * })
 */
export const searchGraph = async (
  db: Database.Database,
  projectRoot: string,
  input: SearchGraphInput,
  options: SearchGraphOptions = {},
): Promise<string> => {
  // Validate input - at least one constraint required
  if (!input.topic && !input.from && !input.to) {
    return "Error: At least one of 'topic', 'from', or 'to' is required.";
  }

  const maxNodes = input.max_nodes ?? options.maxNodes;
  const searchIndex = options.searchIndex;
  const embeddingProvider = options.embeddingProvider;

  // Resolve endpoints (exact symbol or lexical + semantic search)
  // Returns arrays: symbol = single result, query = multiple results
  const fromResolved = await resolveEndpoint(
    input.from,
    searchIndex,
    embeddingProvider,
  );
  const toResolved = await resolveEndpoint(
    input.to,
    searchIndex,
    embeddingProvider,
  );

  // Case 1: Both from and to resolved → path finding
  // For now, use first match from each (path finding with multiple endpoints is complex)
  // (topic filtering for paths not yet implemented)
  if (fromResolved.length > 0 && toResolved.length > 0) {
    const from = fromResolved[0]!;
    const to = toResolved[0]!;
    return pathsBetween(
      db,
      projectRoot,
      { file_path: from.file_path, symbol: from.symbol },
      { file_path: to.file_path, symbol: to.symbol },
      { ...options, maxNodes },
    );
  }

  // Case 2: Only from resolved → forward traversal (dependencies)
  // If query returned multiple results, merge dependencies from all
  if (fromResolved.length > 0) {
    // If topic is provided AND search index is available, filter by topic
    if (input.topic && searchIndex) {
      // For now, use single endpoint for topic filtering
      const from = fromResolved[0]!;
      return traverseWithTopicFilter(
        db,
        projectRoot,
        "dependencies",
        from.file_path,
        from.symbol,
        input.topic,
        searchIndex,
        embeddingProvider,
        maxNodes,
      );
    }

    // Multiple from endpoints: query dependencies for each, merge results
    if (fromResolved.length > 1 && input.from?.query) {
      return queryMultipleFromEndpoints(
        db,
        projectRoot,
        fromResolved,
        maxNodes,
      );
    }

    // Single endpoint: standard traversal
    const from = fromResolved[0]!;
    return dependenciesOf(db, projectRoot, from.file_path, from.symbol, {
      ...options,
      maxNodes,
    });
  }

  // Case 3: Only to resolved → backward traversal (dependents)
  // If query returned multiple results, merge dependents from all
  if (toResolved.length > 0) {
    // If topic is provided AND search index is available, filter by topic
    if (input.topic && searchIndex) {
      // For now, use single endpoint for topic filtering
      const to = toResolved[0]!;
      return traverseWithTopicFilter(
        db,
        projectRoot,
        "dependents",
        to.file_path,
        to.symbol,
        input.topic,
        searchIndex,
        embeddingProvider,
        maxNodes,
      );
    }

    // Multiple to endpoints: query dependents for each, merge results
    if (toResolved.length > 1 && input.to?.query) {
      return queryMultipleToEndpoints(db, projectRoot, toResolved, maxNodes);
    }

    // Single endpoint: standard traversal
    const to = toResolved[0]!;
    return dependentsOf(db, projectRoot, to.file_path, to.symbol, {
      ...options,
      maxNodes,
    });
  }

  // Case 4: Semantic search (topic only, or query-based from/to without search index)
  if (input.topic) {
    if (!searchIndex) {
      return "Semantic search requires embeddings. Run the server to enable semantic search.";
    }

    const searchConfig = await getSearchConfig(
      input.topic,
      searchIndex,
      embeddingProvider,
    );

    const results = await searchIndex.search(input.topic, {
      limit: maxNodes ?? 50,
      ...searchConfig,
    });

    if (results.length === 0) {
      return `No symbols found matching topic: "${input.topic}"`;
    }

    // Extract node IDs from search results
    const nodeIds = results.map((r) => r.id);

    // Query edges between topic-relevant nodes
    const edges = queryEdgesBetweenNodes(db, nodeIds);

    // If no edges found, return as flat list (isolated symbols)
    if (edges.length === 0) {
      const searchModeLabel =
        searchConfig.mode === "hybrid" ? "semantic" : "keyword";
      const lines = results.map(
        (r) =>
          `${r.symbol} (${r.nodeType}) - ${r.file} [score: ${r.score.toFixed(3)}]`,
      );
      return `## Symbols matching "${input.topic}" (${searchModeLabel} search)\n\nNo connections found between symbols.\n\n${lines.join("\n")}`;
    }

    // Format as graph
    return formatFilteredTraversal({
      db,
      projectRoot,
      edges,
      startNodeId: "", // No single start node - include all
      maxNodes,
    });
  }

  // Query-based from/to without search index
  if ((input.from?.query || input.to?.query) && !searchIndex) {
    return "Semantic search requires embeddings. Run the server to enable semantic search.";
  }

  // Query-based from/to that failed to resolve (no matching symbols found)
  if (input.from?.query && !fromResolved) {
    return `No symbols found matching query: "${input.from.query}". Try a more specific query or use Topic search.`;
  }
  if (input.to?.query && !toResolved) {
    return `No symbols found matching query: "${input.to.query}". Try a more specific query or use Topic search.`;
  }

  return "Error: Invalid query. Provide either exact symbols or search queries.";
};
