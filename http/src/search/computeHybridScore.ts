const BM25_WEIGHT = 0.5;
const VECTOR_WEIGHT = 0.5;
const BM25_COMPRESSION = 0.3;

/**
 * Compute hybrid search score from raw BM25 and cosine similarity scores.
 *
 * Pure scorer — no filtering logic. Cosine-only noise rejection is handled
 * upstream by Orama's `similarity` threshold on vector search.
 *
 * ## Why custom scoring?
 *
 * Orama's built-in hybrid mode uses min-max normalization that destroys
 * absolute score meaning. We run BM25 and vector searches separately and
 * combine them here.
 *
 * ## BM25 normalization
 *
 * Raw BM25 scores vary wildly (3-26+). Power compression (score/max)^0.3
 * flattens the curve: 0.27 linear → 0.64 compressed.
 *
 * @example
 * computeHybridScore(6, 22, 0.67) // ~0.67 (mid-range BM25 + good cosine)
 */
export const computeHybridScore = (
  bm25Score: number,
  maxBm25Score: number,
  cosineScore: number,
): number => {
  if (maxBm25Score === 0) {
    return cosineScore * VECTOR_WEIGHT;
  }
  const normalizedBm25 = (bm25Score / maxBm25Score) ** BM25_COMPRESSION;
  return normalizedBm25 * BM25_WEIGHT + cosineScore * VECTOR_WEIGHT;
};
