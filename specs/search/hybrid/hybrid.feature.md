# Hybrid Search

**Status:** ✅ Implemented

**ID:** `search.hybrid`

Hybrid search combines lexical (BM25) `[@search.lexical]` and semantic (vector)
`[@search.semantic]` scores into a single ranking. BM25 and vector searches run
independently; this feature covers how their results are merged and scored.

## Score combination

### Separate searches

> `{#search.hybrid::separate-searches}`

When a query includes both text and a vector, the system runs BM25 and vector
searches independently against the index (not through a single combined query).
This avoids Orama's built-in hybrid normalization, which destroys absolute score
meaning.

### Union merge

> `{#search.hybrid::union-merge}`

Results from BM25 and vector searches are merged by document ID (union). A
document found by both searches receives both a BM25 score and a cosine score. A
document found by only one search receives a score of 0 for the other.

### BM25 normalization

> `{#search.hybrid::bm25-normalization}`

Raw BM25 scores are normalized to the 0-1 range by dividing each score by the
maximum BM25 score in the result set: `normalizedBm25 = bm25Score / maxBm25Score`.

### BM25 compression

> `{#search.hybrid::bm25-compression}`

After normalization, BM25 scores are compressed using a power function with
exponent 0.3: `compressedBm25 = normalizedBm25 ^ 0.3`. This flattens the score
distribution so that mid-range BM25 scores are not dwarfed by the top score
(e.g., a linear ratio of 0.27 becomes ~0.64 after compression).

### Equal weight combination

> `{#search.hybrid::equal-weight}`

The final hybrid score is the weighted sum: `compressedBm25 * 0.5 + cosineScore * 0.5`.
BM25 and vector contribute equally (50% each).

### Score range

> `{#search.hybrid::score-range}`

The hybrid score is bounded between 0 and 1 (inclusive). When both BM25 and
cosine are at their maximum (1.0), the hybrid score does not exceed 1.0. When
both are 0, the hybrid score is 0.

## Ranking

### Zero-score filtering

> `{#search.hybrid::zero-score-filtering}`

Results with a hybrid score of 0 are excluded from the output.

### Descending sort

> `{#search.hybrid::descending-sort}`

Results are sorted by hybrid score in descending order (highest first).

## Edge cases

### Vector-only fallback

> `{#search.hybrid::vector-only-fallback}`

When no documents match BM25 (maxBm25Score is 0), the hybrid score reduces to
`cosineScore * 0.5`. The BM25 component contributes nothing, but the vector
weight still applies — the score is halved, not passed through at full value.

### Cosine contribution consistency

> `{#search.hybrid::cosine-consistency}`

The cosine contribution (`cosineScore * 0.5`) is the same whether or not BM25
matches exist in the result set. A document with cosine 0.7 and no BM25 match
receives the same cosine contribution as a document with cosine 0.7 and a BM25
match — only the BM25 component differs.

### BM25-only cosine backfill

> `{#search.hybrid::bm25-backfill}`

When a document matches BM25 but falls below the vector similarity threshold
(and thus has no cosine score from vector search), the system attempts to
backfill its cosine score by computing cosine similarity from cached or
freshly-generated embeddings. This gives BM25-only hits a fair hybrid score
instead of treating their cosine as 0.

### Vector similarity threshold

> `{#search.hybrid::vector-threshold}`

Vector search uses a minimum cosine similarity of 0.6. Documents with cosine
similarity below this threshold are excluded from vector results. They may still
appear as BM25-only hits (and benefit from `[@search.hybrid::bm25-backfill]`).
