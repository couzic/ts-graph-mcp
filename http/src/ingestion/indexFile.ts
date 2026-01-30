import type { SourceFile } from "ts-morph";
import type { DbWriter } from "../db/DbWriter.js";
import type { Node } from "../db/Types.js";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import type { SearchIndexWrapper } from "../search/createSearchIndex.js";
import type { SearchDocument } from "../search/SearchTypes.js";
import type { EdgeExtractionContext } from "./extract/edges/EdgeExtractionContext.js";
import { extractEdges } from "./extract/edges/extractEdges.js";
import { extractNodes } from "./extract/nodes/extractNodes.js";

/** Maximum lines of source code to include in embedding content */
const MAX_SOURCE_LINES = 50;

/**
 * Extract source snippet for a node from the source file text.
 */
const extractSourceSnippet = (
  sourceText: string,
  node: Node,
): string => {
  const lines = sourceText.split("\n");
  const startIdx = node.startLine - 1; // 1-indexed to 0-indexed
  const endIdx = Math.min(node.endLine, startIdx + MAX_SOURCE_LINES);
  const snippet = lines.slice(startIdx, endIdx).join("\n");

  if (node.endLine > startIdx + MAX_SOURCE_LINES) {
    return snippet + "\n// ... truncated";
  }
  return snippet;
};

/**
 * Prepare content for embedding.
 * Includes metadata prefix and source snippet.
 */
const prepareEmbeddingContent = (
  node: Node,
  sourceSnippet: string,
): string => {
  return `// ${node.type}: ${node.name}
// File: ${node.filePath}

${sourceSnippet}`.trim();
};

/**
 * Convert a graph node to a search document.
 */
const nodeToSearchDoc = (
  node: Node,
  sourceSnippet: string,
  embedding?: number[],
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
 * Options for indexing a single file.
 */
export interface IndexFileOptions {
  /** Search index for fulltext/semantic search (optional) */
  searchIndex?: SearchIndexWrapper;
  /** Embedding provider for semantic search (optional) */
  embeddingProvider?: EmbeddingProvider;
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
 * @param options - Optional search index for unified indexing
 * @returns Count of nodes and edges added
 */
export const indexFile = async (
  sourceFile: SourceFile,
  context: EdgeExtractionContext,
  writer: DbWriter,
  options: IndexFileOptions = {},
): Promise<IndexFileResult> => {
  let nodesAdded = 0;
  let edgesAdded = 0;

  // Extract and write nodes
  const nodes = extractNodes(sourceFile, context);
  if (nodes.length > 0) {
    await writer.addNodes(nodes);
    nodesAdded = nodes.length;

    // Add to search index
    if (options.searchIndex) {
      const sourceText = sourceFile.getFullText();
      const { embeddingProvider } = options;

      // Extract snippets for all nodes
      const nodeSnippets = nodes.map((node) => ({
        node,
        snippet: extractSourceSnippet(sourceText, node),
      }));

      // Generate embeddings in parallel (if provider available)
      let embeddings: Array<number[] | undefined>;
      if (embeddingProvider) {
        embeddings = await Promise.all(
          nodeSnippets.map(({ node, snippet }) =>
            embeddingProvider.embedDocument(prepareEmbeddingContent(node, snippet)),
          ),
        );
      } else {
        embeddings = nodeSnippets.map(() => undefined);
      }

      // Build search documents with embeddings
      const searchDocs = nodeSnippets.map(({ node, snippet }, i) =>
        nodeToSearchDoc(node, snippet, embeddings[i]),
      );

      await options.searchIndex.addBatch(searchDocs);
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
