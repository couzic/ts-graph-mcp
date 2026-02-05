import type { EmbeddingCacheConnection } from "./embeddingCache.js";

/**
 * Create a fake embedding cache for testing.
 *
 * Returns a zero-filled Float32Array for any hash lookup (always a cache hit).
 * This prevents populateSearchIndex from attempting filesystem reads during tests.
 *
 * @example
 * const cache = createFakeEmbeddingCache(384);
 */
export const createFakeEmbeddingCache = (
  dimensions = 384,
): EmbeddingCacheConnection => {
  return {
    get(): Float32Array {
      return new Float32Array(dimensions);
    },

    getBatch(hashes: string[]): Map<string, Float32Array> {
      const map = new Map<string, Float32Array>();
      for (const hash of hashes) {
        map.set(hash, new Float32Array(dimensions));
      }
      return map;
    },

    set(): void {
      // No-op
    },

    close(): void {
      // No-op
    },
  };
};
