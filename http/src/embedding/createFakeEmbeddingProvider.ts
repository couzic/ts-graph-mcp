import type { EmbeddingProvider } from "./EmbeddingTypes.js";

/**
 * Create a fake embedding provider for testing.
 *
 * Generates deterministic vectors based on input text hash.
 * No model download required.
 *
 * @example
 * const provider = createFakeEmbeddingProvider({ dimensions: 384 });
 * const embedding = await provider.embedDocument('function validate() {}');
 * expect(embedding).toHaveLength(384);
 */
export const createFakeEmbeddingProvider = (options?: {
  dimensions?: number;
  /** Throws context overflow error if content exceeds this length */
  maxContentLength?: number;
  /** Callback invoked with each embedded content (for test assertions) */
  onEmbed?: (content: string) => void;
}): EmbeddingProvider => {
  const dimensions = options?.dimensions ?? 384;
  const { maxContentLength, onEmbed } = options ?? {};

  /**
   * Simple string hash function.
   * Returns a number that can be used to seed vector generation.
   */
  const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  /**
   * Generate a deterministic vector from a seed.
   * Uses a simple linear congruential generator for reproducibility.
   */
  const generateVector = (seed: number): Float32Array => {
    const vector = new Float32Array(dimensions);
    let current = seed;
    for (let i = 0; i < dimensions; i++) {
      // Linear congruential generator
      current = (current * 1103515245 + 12345) & 0x7fffffff;
      // Normalize to [-1, 1] range
      vector[i] = (current / 0x7fffffff) * 2 - 1;
    }
    // Normalize to unit vector
    let sumOfSquares = 0;
    for (const v of vector) {
      sumOfSquares += v * v;
    }
    const magnitude = Math.sqrt(sumOfSquares);
    for (let i = 0; i < vector.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: index bounds checked by loop
      vector[i] = vector[i]! / magnitude;
    }
    return vector;
  };

  return {
    get ready() {
      return true;
    },

    async initialize(): Promise<void> {
      // No initialization needed for fake provider
    },

    async embedQuery(text: string): Promise<Float32Array> {
      const seed = hashString(`query:${text}`);
      return generateVector(seed);
    },

    async embedDocument(text: string): Promise<Float32Array> {
      if (maxContentLength !== undefined && text.length > maxContentLength) {
        throw new Error(
          "Input is longer than the context size. Try to increase the context size or use another model that supports longer contexts.",
        );
      }
      onEmbed?.(text);
      const seed = hashString(`document:${text}`);
      return generateVector(seed);
    },

    async dispose(): Promise<void> {
      // No resources to dispose
    },
  };
};
