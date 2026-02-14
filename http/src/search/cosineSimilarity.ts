/**
 * Compute cosine similarity between two vectors.
 * Works correctly regardless of whether vectors are normalized.
 *
 * @example
 * const a = new Float32Array([1, 2, 3]);
 * const b = new Float32Array([4, 5, 6]);
 * cosineSimilarity(a, b) // 0.9746...
 */
export const cosineSimilarity = (a: Float32Array, b: Float32Array): number => {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index bounds checked by loop
    dot += a[i]! * b[i]!;
    // biome-ignore lint/style/noNonNullAssertion: index bounds checked by loop
    magA += a[i]! * a[i]!;
    // biome-ignore lint/style/noNonNullAssertion: index bounds checked by loop
    magB += b[i]! * b[i]!;
  }
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) {
    return 0;
  }
  return dot / magnitude;
};
