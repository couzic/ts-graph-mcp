import type { EmbeddingProvider } from "./EmbeddingTypes.js";

/**
 * Create a no-op embedding provider for when embedding is disabled.
 *
 * `initialize()` and `dispose()` are no-ops. `embedDocument()` and `embedQuery()`
 * throw — they should never be called when embedding is disabled.
 * `enabled` is `false` and `dimensions` is `0`.
 *
 * @spec configuration::embedding.disabled
 *
 * @example
 * const provider = createNoopEmbeddingProvider();
 * provider.dimensions // 0
 */
export const createNoopEmbeddingProvider = (): EmbeddingProvider => ({
  enabled: false,
  dimensions: 0,

  async initialize(): Promise<void> {},

  async embedQuery(): Promise<Float32Array> {
    throw new Error(
      "embedQuery() called on no-op provider. Embedding is disabled.",
    );
  },

  async embedDocument(): Promise<Float32Array> {
    throw new Error(
      "embedDocument() called on no-op provider. Embedding is disabled.",
    );
  },

  async dispose(): Promise<void> {},
});
