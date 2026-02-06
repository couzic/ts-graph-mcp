import type { SourceFile } from "ts-morph";
import type { DbWriter } from "../db/DbWriter.js";
import type { ExtractedNode, Node } from "../db/Types.js";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import {
  computeContentHash,
  type EmbeddingCacheConnection,
} from "../embedding/embeddingCache.js";
import { prepareEmbeddingContent } from "../embedding/prepareEmbeddingContent.js";
import type { SearchIndexWrapper } from "../search/createSearchIndex.js";
import type { SearchDocument } from "../search/SearchTypes.js";
import type { EdgeExtractionContext } from "./extract/edges/EdgeExtractionContext.js";
import { extractEdges } from "./extract/edges/extractEdges.js";
import { extractNodes } from "./extract/nodes/extractNodes.js";
import { stripClassImplementation } from "./stripClassImplementation.js";

/** Minimum snippet length worth embedding (below this, use metadata-only) */
const MIN_USEFUL_SNIPPET_LENGTH = 100;

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
 * Check if an error is a context overflow error from the embedding model.
 */
const isContextOverflowError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("context size");

/**
 * Result of embedding a node's content.
 */
interface EmbedResult {
  /** The embedding vector */
  embedding: Float32Array;
  /** Hash of the content that was actually embedded (after any truncation) */
  contentHash: string;
}

/**
 * Embed content with progressive fallback strategy.
 * Tries: full content → stripped (for Class) → truncated (halving until fits).
 * Never throws - always returns an embedding.
 * Returns both the embedding and the hash of the content that was actually embedded.
 */
const embedWithFallback = async (
  node: ExtractedNode,
  snippet: string,
  embeddingProvider: EmbeddingProvider,
  embeddingCache: EmbeddingCacheConnection | undefined,
): Promise<EmbedResult> => {
  const tryEmbed = async (content: string): Promise<EmbedResult | null> => {
    const hash = computeContentHash(content);
    const cached = embeddingCache?.get(hash);
    if (cached) {
      return { embedding: cached, contentHash: hash };
    }

    try {
      const vector = await embeddingProvider.embedDocument(content);
      embeddingCache?.set(hash, vector);
      return { embedding: vector, contentHash: hash };
    } catch (error) {
      if (isContextOverflowError(error)) {
        return null; // Signal to try fallback
      }
      throw error; // Non-context errors are real failures
    }
  };

  // Strategy 1: Try full content
  const fullContent = prepareEmbeddingContent(
    node.type,
    node.name,
    node.filePath,
    snippet,
  );
  const fullResult = await tryEmbed(fullContent);
  if (fullResult) {
    return fullResult;
  }

  // Strategy 2: For Class nodes, try stripped implementation
  if (node.type === "Class") {
    const strippedSnippet = stripClassImplementation(snippet);
    const strippedContent = prepareEmbeddingContent(
      node.type,
      node.name,
      node.filePath,
      strippedSnippet,
    );
    const strippedResult = await tryEmbed(strippedContent);
    if (strippedResult) {
      return strippedResult;
    }
  }

  // Strategy 3: Truncate content progressively until it fits
  let truncatedSnippet = snippet;
  while (truncatedSnippet.length > MIN_USEFUL_SNIPPET_LENGTH) {
    truncatedSnippet = truncatedSnippet.slice(
      0,
      Math.floor(truncatedSnippet.length / 2),
    );
    const truncatedContent = prepareEmbeddingContent(
      node.type,
      node.name,
      node.filePath,
      truncatedSnippet,
    );
    const truncatedResult = await tryEmbed(truncatedContent);
    if (truncatedResult) {
      return truncatedResult;
    }
  }

  // Ultimate fallback: metadata only (symbol name + file path)
  const metadataOnly = `// ${node.type}: ${node.name}\n// File: ${node.filePath}`;
  const metadataResult = await tryEmbed(metadataOnly);
  if (metadataResult) {
    return metadataResult;
  }

  // This should never happen unless embedding model has < 50 char context
  throw new Error(`Failed to embed ${node.id} even with minimal content`);
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

    // Generate embeddings in parallel
    const embedResults = await Promise.all(
      nodeSnippets.map(({ node, snippet }) =>
        embedWithFallback(node, snippet, embeddingProvider, embeddingCache),
      ),
    );

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
