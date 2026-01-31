import type { EmbeddingModelPreset } from "./EmbeddingTypes.js";

/**
 * Available embedding model presets.
 *
 * All models are GGUF format for use with node-llama-cpp.
 * Presets balance quality vs size for typical developer machines.
 */
export const EMBEDDING_PRESETS: Record<string, EmbeddingModelPreset> = {
  /**
   * Qwen3 0.6B embedding model - good balance of quality and size.
   * ~650MB download, suitable for most development machines.
   */
  "qwen3-0.6b": {
    repo: "Qwen/Qwen3-Embedding-0.6B-GGUF",
    filename: "Qwen3-Embedding-0.6B-Q8_0.gguf",
    dimensions: 1024,
  },

  /**
   * Qwen3 4B embedding model - higher quality, larger size.
   * ~4GB download, for machines with more RAM.
   */
  "qwen3-4b": {
    repo: "Qwen/Qwen3-Embedding-4B-GGUF",
    filename: "Qwen3-Embedding-4B-Q8_0.gguf",
    dimensions: 2560,
  },

  /**
   * Jina Code v2 - specialized for code embedding.
   * Smaller model optimized for code search.
   */
  "jina-embeddings-v2-base-code": {
    repo: "jinaai/jina-embeddings-v2-base-code",
    filename: "jina-embeddings-v2-base-code-Q8_0.gguf",
    dimensions: 768,
    queryPrefix: "query: ",
    documentPrefix: "passage: ",
  },

  /**
   * Nomic Embed Text v1.5 - general purpose embedding.
   * Good quality with reasonable size.
   */
  "nomic-embed-text-v1.5": {
    repo: "nomic-ai/nomic-embed-text-v1.5-GGUF",
    filename: "nomic-embed-text-v1.5.Q8_0.gguf",
    dimensions: 768,
    queryPrefix: "search_query: ",
    documentPrefix: "search_document: ",
  },
};

/**
 * Default preset to use when none specified.
 */
export const DEFAULT_PRESET = "nomic-embed-text-v1.5";
