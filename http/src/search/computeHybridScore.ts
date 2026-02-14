const BM25_WEIGHT = 0.5;
const VECTOR_WEIGHT = 0.5;
const BM25_COMPRESSION = 0.3;
const COSINE_ONLY_THRESHOLD = 0.6;

/**
 * Compute hybrid search score from raw BM25 and cosine similarity scores.
 *
 * ## Why custom scoring?
 *
 * Orama's built-in hybrid mode uses min-max normalization that destroys
 * absolute score meaning. When BM25 has no matches, the top vector result
 * normalizes to 1.0 → blended score capped at 0.5. This makes noise
 * indistinguishable from real semantic matches.
 *
 * Instead, we run BM25 and vector searches separately and combine them here.
 *
 * ## Orama BM25 behavior (from oramaBehavior.test.ts)
 *
 * - No stemming: "logging" does NOT match "log" or "logger"
 * - Prefix matching: "log" DOES match "logger", "valid" matches "validate"
 * - Splits on spaces, underscores, hyphens (not camelCase)
 * - Scores are unbounded (observed range: 3-26 depending on corpus/query)
 * - Multi-term queries use OR, higher score when more terms match
 *
 * ## BM25 normalization
 *
 * Raw BM25 scores vary wildly (3-26+). Linear normalization (score/max)
 * crushes mid-range matches: a score of 6/22 = 0.27 becomes nearly
 * irrelevant. Power compression (score/max)^0.3 flattens the curve:
 * 0.27 linear → 0.64 compressed.
 *
 * ## Score distribution (observed on real codebase)
 *
 * Cosine similarity (from embeddings):
 * - Noise (irrelevant queries): 0.50-0.53
 * - Genuine semantic matches:   0.64-0.73
 * - Clear gap around 0.55-0.60
 *
 * Hybrid scores (BM25 + cosine):
 * - Top BM25+cosine matches:    0.78-0.85
 * - Mid-range BM25+cosine:      0.62-0.67
 * - Cosine-only (no BM25):      0.32-0.37 (halved by VECTOR_WEIGHT)
 *
 * ## Known limitation
 *
 * When bm25Score = 0 but maxBm25Score > 0 (this document didn't match
 * BM25, but others did), cosine gets halved (multiplied by VECTOR_WEIGHT).
 * The same document scores 0.7 in a cosine-only context but 0.35 when
 * other documents have BM25 matches. Downstream consumers should account
 * for this when setting thresholds.
 *
 * @example
 * computeHybridScore(6, 22, 0.67) // ~0.67 (mid-range BM25 + good cosine)
 */
export const computeHybridScore = (
  bm25Score: number,
  maxBm25Score: number,
  cosineScore: number,
): number => {
  if (bm25Score === 0 && cosineScore < COSINE_ONLY_THRESHOLD) {
    return 0;
  }
  if (maxBm25Score === 0) {
    return cosineScore * VECTOR_WEIGHT;
  }
  const normalizedBm25 = (bm25Score / maxBm25Score) ** BM25_COMPRESSION;
  return normalizedBm25 * BM25_WEIGHT + cosineScore * VECTOR_WEIGHT;
};
