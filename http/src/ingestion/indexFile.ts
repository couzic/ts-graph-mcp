import type { SourceFile } from "ts-morph";
import type { DbWriter } from "../db/DbWriter.js";
import type { ExtractedNode, Node } from "../db/Types.js";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import type { EmbeddingCacheConnection } from "../embedding/embeddingCache.js";
import { embedWithFallback } from "../embedding/embedWithFallback.js";
import type { SearchIndexWrapper } from "../search/createSearchIndex.js";
import type { SearchDocument } from "../search/SearchTypes.js";
import type { EdgeExtractionContext } from "./extract/edges/EdgeExtractionContext.js";
import { extractEdges } from "./extract/edges/extractEdges.js";
import { extractNodes } from "./extract/nodes/extractNodes.js";

/**
 * Extract source snippet for a node from the source file text.
 * Returns full node content - overflow is handled by embedWithFallback.
 *
 * @example
 * extractSourceSnippet(sourceText, node) // "function foo() { return 42; }"
 */
const extractSourceSnippet = (
  sourceText: string,
  node: ExtractedNode,
): string => {
  const lines = sourceText.split("\n");
  const startIdx = node.startLine - 1; // 1-indexed to 0-indexed
  return lines.slice(startIdx, node.endLine).join("\n");
};

/**
 * Convert a graph node to a search document.
 */
const nodeToSearchDoc = (
  node: ExtractedNode,
  sourceSnippet: string,
  embedding?: Float32Array,
): SearchDocument => ({
  id: node.id,
  symbol: node.name,
  file: node.filePath,
  nodeType: node.type,
  content: sourceSnippet,
  embedding,
});

/**
 * Result of indexing a single file.
 */
export interface IndexFileResult {
  /** Number of nodes extracted and written */
  nodesAdded: number;
  /** Number of edges extracted and written */
  edgesAdded: number;
}

/**
 * Embedding cache connection for looking up and storing embeddings.
 */
export type EmbeddingCache = EmbeddingCacheConnection;

/**
 * Options for indexing a single file.
 */
export interface IndexFileOptions {
  /** Search index for fulltext/semantic search (optional) */
  searchIndex?: SearchIndexWrapper;
  /** Embedding provider for semantic search */
  embeddingProvider: EmbeddingProvider;
  /** Embedding cache for avoiding regeneration (optional) */
  embeddingCache?: EmbeddingCache;
}

/**
 * Index a single source file: extract nodes and edges, write to database and search index.
 *
 * This is the core indexing primitive used by:
 * - indexProject (initial indexing)
 * - watchProject (incremental updates)
 * - syncOnStartup (offline change detection)
 *
 * Note: This function does NOT remove old data. Callers should call
 * writer.removeFileNodes() and searchIndex.removeByFile() before calling this if reindexing.
 *
 * @param sourceFile - ts-morph SourceFile (already loaded into a Project)
 * @param context - Extraction context (filePath, package, projectRegistry)
 * @param writer - Database writer instance
 * @param options - Indexing options including embedding provider
 * @returns Count of nodes and edges added
 */
export const indexFile = async (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
  writer: DbWriter,
  options: IndexFileOptions,
): Promise<IndexFileResult> => {
  let nodesAdded = 0;
  let edgesAdded = 0;

  // Extract nodes
  const extractedNodes = extractNodes(sourceFile, context);
  if (extractedNodes.length > 0) {
    const sourceText = sourceFile.getFullText();
    const { embeddingProvider, embeddingCache, searchIndex } = options;

    // Extract snippets for all nodes
    const nodeSnippets = extractedNodes.map((node) => ({
      node,
      snippet: extractSourceSnippet(sourceText, node),
    }));

    // Generate embeddings sequentially
    const embedResults: Array<{
      contentHash: string;
      embedding?: Float32Array;
    }> = [];
    for (const { node, snippet } of nodeSnippets) {
      const result = await embedWithFallback(
        node.type,
        node.name,
        node.filePath,
        snippet,
        embeddingProvider,
        embeddingCache,
      );
      embedResults.push(result);
    }

    // Enrich extracted nodes with snippet + contentHash to produce full Nodes
    const nodes: Node[] = nodeSnippets.map(({ node, snippet }, i) => ({
      ...node,
      snippet,
      // biome-ignore lint/style/noNonNullAssertion: embedResults has same length as nodeSnippets
      contentHash: embedResults[i]!.contentHash,
    })) as Node[];

    // Write nodes to DB
    await writer.addNodes(nodes);
    nodesAdded = nodes.length;

    // Add to search index
    if (searchIndex) {
      const searchDocs = nodeSnippets.map(({ node, snippet }, i) =>
        nodeToSearchDoc(node, snippet, embedResults[i]?.embedding),
      );
      await searchIndex.addBatch(searchDocs);
    }
  }

  // Extract and write edges
  const edges = extractEdges(sourceFile, context);
  if (edges.length > 0) {
    await writer.addEdges(edges);
    edgesAdded = edges.length;
  }

  return { nodesAdded, edgesAdded };
};
