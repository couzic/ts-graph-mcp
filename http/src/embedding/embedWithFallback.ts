import { stripClassImplementation } from "../ingestion/stripClassImplementation.js";
import type { EmbeddingProvider } from "./EmbeddingTypes.js";
import {
  computeContentHash,
  type EmbeddingCacheConnection,
} from "./embeddingCache.js";
import { prepareEmbeddingContent } from "./prepareEmbeddingContent.js";

/** Minimum snippet length worth embedding (below this, use metadata-only) */
const MIN_USEFUL_SNIPPET_LENGTH = 100;

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
 * Never throws on context overflow — always returns an embedding.
 * Returns both the embedding and the hash of the content that was actually embedded.
 */
export const embedWithFallback = async (
  nodeType: string,
  name: string,
  filePath: string,
  snippet: string,
  embeddingProvider: EmbeddingProvider,
  embeddingCache?: EmbeddingCacheConnection,
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
        return null;
      }
      throw error;
    }
  };

  // Strategy 1: Try full content
  const fullContent = prepareEmbeddingContent(
    nodeType,
    name,
    filePath,
    snippet,
  );
  const fullResult = await tryEmbed(fullContent);
  if (fullResult) {
    return fullResult;
  }

  // Strategy 2: For Class nodes, try stripped implementation
  if (nodeType === "Class") {
    const strippedSnippet = stripClassImplementation(snippet);
    const strippedContent = prepareEmbeddingContent(
      nodeType,
      name,
      filePath,
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
      nodeType,
      name,
      filePath,
      truncatedSnippet,
    );
    const truncatedResult = await tryEmbed(truncatedContent);
    if (truncatedResult) {
      return truncatedResult;
    }
  }

  // Ultimate fallback: metadata only (symbol name + file path)
  const metadataOnly = `// ${nodeType}: ${name}\n// File: ${filePath}`;
  const metadataResult = await tryEmbed(metadataOnly);
  if (metadataResult) {
    return metadataResult;
  }

  throw new Error(
    `Failed to embed ${filePath}:${name} even with minimal content`,
  );
};
