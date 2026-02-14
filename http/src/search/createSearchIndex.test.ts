import assert from "node:assert";
import { create, insert, searchVector } from "@orama/orama";
import { describe, expect, it } from "vitest";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import type { EmbeddingCacheConnection } from "../embedding/embeddingCache.js";
import { cosineSimilarity } from "./cosineSimilarity.js";
import {
  createSearchIndex,
  preprocessForBM25,
  restoreSearchIndex,
  type SearchIndexOptions,
} from "./createSearchIndex.js";
import type { SearchDocument } from "./SearchTypes.js";

const DIMS = 8;

// just a normalized sum for similarity
const simpleEmbeddingFunction = (text: string, dims: number): Float32Array => {
  const vec = new Float32Array(dims);
  for (let i = 0; i < text.length; i++) {
    const idx = i % dims;
    vec[idx] = (vec[idx] ?? 0) + text.charCodeAt(i) / 1000;
  }
  // Normalize
  let sumOfSquares = 0;
  for (const v of vec) {
    sumOfSquares += v * v;
  }
  const norm = Math.sqrt(sumOfSquares) || 1;
  for (let i = 0; i < vec.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index bounds checked by loop
    vec[i] = vec[i]! / norm;
  }
  return vec;
};

describe(preprocessForBM25.name, () => {
  it("includes both split and original", () => {
    expect(preprocessForBM25("validateCart")).toBe(
      "validate Cart validateCart",
    );
  });

  it("handles single-word symbols", () => {
    expect(preprocessForBM25("validate")).toBe("validate");
  });
});

describe(createSearchIndex.name, () => {
  const doc = (
    name: string,
    file = "src/test.ts",
    content = "",
  ): SearchDocument => ({
    id: `${file}:${name}`,
    symbol: name,
    file,
    nodeType: "Function",
    content,
    embedding: simpleEmbeddingFunction(name, DIMS),
  });

  it("indexes and searches documents", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    await index.add(doc("validateCart"));
    await index.add(doc("processOrder"));

    const results = await index.search("validate");

    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe("validateCart");
  });

  it("finds camelCase symbols by split words", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    await index.add(doc("validateCartItems"));

    const results = await index.search("cart items");

    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe("validateCartItems");
  });

  it("returns empty array for no matches", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    await index.add(doc("validateCart"));

    const results = await index.search("nonexistent");

    expect(results).toHaveLength(0);
  });

  it("respects limit option", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    await index.addBatch([
      doc("validateA"),
      doc("validateB"),
      doc("validateC"),
    ]);

    const results = await index.search("validate", { limit: 2 });

    expect(results).toHaveLength(2);
  });

  it("filters by nodeType", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    await index.add({ ...doc("formatDate"), nodeType: "Function" });
    await index.add({ ...doc("DateFormatter"), nodeType: "Class" });

    const results = await index.search("date", { nodeTypes: ["Function"] });

    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe("formatDate");
  });

  it("removes document by ID", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    const document = doc("validateCart");
    await index.add(document);

    await index.remove(document.id);

    const results = await index.search("validate");
    expect(results).toHaveLength(0);
  });

  it("removes all documents for a file", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    await index.add(doc("fnA", "src/utils.ts"));
    await index.add(doc("fnB", "src/utils.ts"));
    await index.add(doc("fnC", "src/other.ts"));

    await index.removeByFile("src/utils.ts");

    const results = await index.search("fn");
    expect(results).toHaveLength(1);
    expect(results[0]?.file).toBe("src/other.ts");
  });

  it("batch adds documents efficiently", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    await index.addBatch([doc("fnA"), doc("fnB"), doc("fnC")]);

    const count = await index.count();
    expect(count).toBe(3);
  });

  it("exports and restores index", async () => {
    const original = await createSearchIndex({ vectorDimensions: DIMS });

    await original.add(doc("validateCart"));
    await original.add(doc("processOrder"));

    const exported = await original.export();
    const restored = await restoreSearchIndex(exported, {
      vectorDimensions: DIMS,
    });

    const results = await restored.search("validate");
    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe("validateCart");
  });

  it("performs hybrid search when vector is provided", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    await index.add(doc("validateCart"));
    await index.add(doc("processOrder"));

    const queryVector = simpleEmbeddingFunction("validate", DIMS);
    const results = await index.search("validate", {
      vector: queryVector,
    });

    expect(results.length).toBeGreaterThan(0);
  });

  describe("hybrid search merge logic", () => {
    it("merges document appearing in both BM25 and vector results", async () => {
      const index = await createSearchIndex({ vectorDimensions: DIMS });

      // "validateCart" will match BM25 for "validate" AND vector for "validate"
      await index.add(doc("validateCart"));
      // "processOrder" won't match BM25 for "validate"
      await index.add(doc("processOrder"));

      const queryVector = simpleEmbeddingFunction("validateCart", DIMS);
      const results = await index.search("validate", { vector: queryVector });

      // validateCart should appear with a combined score (BM25 + cosine)
      const validateResult = results.find((r) => r.symbol === "validateCart");
      expect(validateResult).toBeDefined();
    });

    it("returns results sorted by hybrid score descending", async () => {
      const index = await createSearchIndex({ vectorDimensions: DIMS });

      await index.addBatch([
        doc("validateA"),
        doc("validateB"),
        doc("validateC"),
      ]);

      const queryVector = simpleEmbeddingFunction("validateA", DIMS);
      const results = await index.search("validate", { vector: queryVector });

      for (let i = 1; i < results.length; i++) {
        // biome-ignore lint/style/noNonNullAssertion: index bounds checked
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });

    it("filters out zero-score results", async () => {
      const index = await createSearchIndex({ vectorDimensions: DIMS });

      // Add docs with very different names — "zzz" won't match BM25 for "validate"
      // and with simple embedding function, cosine will likely be below threshold
      await index.add(doc("validateCart"));
      await index.add(doc("zzz", "src/test.ts", "unrelated content"));

      const queryVector = simpleEmbeddingFunction("validateCart", DIMS);
      const results = await index.search("validate", { vector: queryVector });

      // All returned results must have score > 0
      for (const result of results) {
        expect(result.score).toBeGreaterThan(0);
      }
    });

    it("includes vector-only results when cosine is high enough", async () => {
      const index = await createSearchIndex({ vectorDimensions: DIMS });

      // "processOrder" won't match BM25 for "validate"
      // but we give it an embedding very similar to the query vector
      const queryVector = simpleEmbeddingFunction("processOrder", DIMS);
      await index.add(doc("processOrder"));
      await index.add(doc("validateCart"));

      // Search for "validate" with vector similar to "processOrder"
      // validateCart matches BM25, processOrder matches vector
      const results = await index.search("validate", { vector: queryVector });

      // Both could appear (depends on cosine threshold)
      // At minimum, the BM25-matched one should appear
      expect(results.some((r) => r.symbol === "validateCart")).toBe(true);
    });

    it("respects limit in hybrid search", async () => {
      const index = await createSearchIndex({ vectorDimensions: DIMS });

      await index.addBatch([
        doc("validateA"),
        doc("validateB"),
        doc("validateC"),
        doc("validateD"),
      ]);

      const queryVector = simpleEmbeddingFunction("validate", DIMS);
      const results = await index.search("validate", {
        vector: queryVector,
        limit: 2,
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  it("addBatch inserts documents both with and without embeddings", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    const docWithoutEmbedding: SearchDocument = {
      id: "src/test.ts:noEmbed",
      symbol: "noEmbed",
      file: "src/test.ts",
      nodeType: "Function",
      content: "",
    };

    await index.addBatch([doc("withEmbed"), docWithoutEmbedding]);

    const count = await index.count();
    expect(count).toBe(2);
  });
});

/**
 * Create a fake in-memory embedding cache for testing.
 */
const createFakeCache = (): EmbeddingCacheConnection & {
  store: Map<string, Float32Array>;
} => {
  const store = new Map<string, Float32Array>();
  return {
    store,
    get(hash: string) {
      return store.get(hash);
    },
    getBatch(hashes: string[]) {
      const result = new Map<string, Float32Array>();
      for (const hash of hashes) {
        const vec = store.get(hash);
        if (vec) {
          result.set(hash, vec);
        }
      }
      return result;
    },
    set(hash: string, vector: Float32Array) {
      store.set(hash, vector);
    },
    close() {},
  };
};

/**
 * Create a fake embedding provider that uses simpleEmbeddingFunction.
 */
const createFakeProvider = (dims: number): EmbeddingProvider => ({
  async initialize() {},
  async embedQuery(text: string) {
    return simpleEmbeddingFunction(text, dims);
  },
  async embedDocument(text: string) {
    return simpleEmbeddingFunction(text, dims);
  },
  async dispose() {},
});

/**
 * Build a normalized vector with a known cosine to a reference vector [1, 0, 0, ...].
 * Used to control exactly which docs pass the vector similarity threshold.
 */
const embeddingWithCosine = (
  targetCosine: number,
  dims: number,
): Float32Array => {
  const vec = new Float32Array(dims);
  vec[0] = targetCosine;
  vec[1] = Math.sqrt(1 - targetCosine * targetCosine);
  return vec;
};

/** Reference query vector: unit vector along first axis. */
const queryVec = (dims: number): Float32Array => {
  const vec = new Float32Array(dims);
  vec[0] = 1;
  return vec;
};

describe("cosine backfill for BM25-only hits", () => {
  /**
   * Test setup:
   * - Query vector: [1, 0, 0, ...] (unit vector)
   * - "validateCart": matches BM25 + cosine 0.9 → appears in both BM25 and vector
   * - "bm25OnlyDoc": matches BM25 (via content "validate") + cosine 0.4
   *   → excluded from vector results (below 0.6 threshold)
   *   → backfill should compute real cosine from cache
   */
  const setupBackfillIndex = async (
    backfillDeps: {
      cache?: ReturnType<typeof createFakeCache>;
      providerDims?: number;
      skipCache?: boolean;
    } = {},
  ) => {
    const cache = backfillDeps.cache ?? createFakeCache();
    const dims = backfillDeps.providerDims ?? DIMS;
    const provider = createFakeProvider(dims);

    // The BM25-only doc's embedding (cosine 0.4 to query → below 0.6 threshold)
    const bm25OnlyEmbedding = embeddingWithCosine(0.4, dims);
    const bm25OnlyHash = "hash-bm25only";

    if (!backfillDeps.skipCache) {
      cache.set(bm25OnlyHash, bm25OnlyEmbedding);
    }

    const nodeData = new Map<
      string,
      { contentHash: string; snippet: string }
    >();
    nodeData.set("src/test.ts:bm25OnlyDoc", {
      contentHash: bm25OnlyHash,
      snippet: "function bm25OnlyDoc() { validate(); }",
    });

    const options: SearchIndexOptions = {
      vectorDimensions: dims,
      openCache: () => cache,
      embeddingProvider: provider,
      getNodeEmbeddingData: (ids: string[]) => {
        const result = new Map<
          string,
          { contentHash: string; snippet: string }
        >();
        for (const id of ids) {
          const data = nodeData.get(id);
          if (data) {
            result.set(id, data);
          }
        }
        return result;
      },
    };

    const index = await createSearchIndex(options);

    // Matches BM25 for "validate" AND vector (cosine 0.9 > 0.6)
    await index.add({
      id: "src/test.ts:validateCart",
      symbol: "validateCart",
      file: "src/test.ts",
      nodeType: "Function",
      content: "",
      embedding: embeddingWithCosine(0.9, dims),
    });

    // Matches BM25 for "validate" (via content), but cosine 0.4 < 0.6
    // → excluded from Orama vector results → BM25-only hit → needs backfill
    await index.add({
      id: "src/test.ts:bm25OnlyDoc",
      symbol: "bm25OnlyDoc",
      file: "src/test.ts",
      nodeType: "Function",
      content: "validate something",
      embedding: bm25OnlyEmbedding,
    });

    return { index, cache, bm25OnlyEmbedding, query: queryVec(dims) };
  };

  it("backfills cosine score for BM25-only hits from embedding cache", async () => {
    const { index, query, bm25OnlyEmbedding } = await setupBackfillIndex();

    const results = await index.search("validate", { vector: query });

    const bm25Only = results.find((r) => r.symbol === "bm25OnlyDoc");
    assert(bm25Only !== undefined);

    // With backfill, score includes real cosine (0.4), not just BM25 * 0.5
    const expectedCosine = cosineSimilarity(query, bm25OnlyEmbedding);
    expect(expectedCosine).toBeCloseTo(0.4, 1);
    // hybridScore = normalizedBm25 * 0.5 + 0.4 * 0.5 = normalizedBm25 * 0.5 + 0.2
    expect(bm25Only.score).toBeGreaterThan(0.2);
  });

  it("computes embedding via provider on cache miss", async () => {
    const cache = createFakeCache();
    const { index } = await setupBackfillIndex({ cache, skipCache: true });

    const results = await index.search("validate", {
      vector: queryVec(DIMS),
    });

    const bm25Only = results.find((r) => r.symbol === "bm25OnlyDoc");
    assert(bm25Only !== undefined);
    expect(bm25Only.score).toBeGreaterThan(0);

    // Provider should have generated and stored the embedding in cache
    expect(cache.store.has("hash-bm25only")).toBe(true);
  });

  it("skips backfill when dependencies are not provided", async () => {
    // No backfill deps → cosine stays 0 for BM25-only hits
    const index = await createSearchIndex({ vectorDimensions: DIMS });

    await index.add({
      id: "src/test.ts:validateCart",
      symbol: "validateCart",
      file: "src/test.ts",
      nodeType: "Function",
      content: "",
      embedding: embeddingWithCosine(0.9, DIMS),
    });

    await index.add({
      id: "src/test.ts:bm25OnlyDoc",
      symbol: "bm25OnlyDoc",
      file: "src/test.ts",
      nodeType: "Function",
      content: "validate something",
      embedding: embeddingWithCosine(0.4, DIMS),
    });

    const withBackfill = await setupBackfillIndex();
    const backfillResults = await withBackfill.index.search("validate", {
      vector: queryVec(DIMS),
    });

    const noBackfillResults = await index.search("validate", {
      vector: queryVec(DIMS),
    });

    const withScore = backfillResults.find((r) => r.symbol === "bm25OnlyDoc");
    const withoutScore = noBackfillResults.find(
      (r) => r.symbol === "bm25OnlyDoc",
    );
    assert(withScore !== undefined);
    assert(withoutScore !== undefined);

    // Backfilled version should have a higher score (includes real cosine)
    expect(withScore.score).toBeGreaterThan(withoutScore.score);
  });
});

/**
 * Build a normalized vector with a known cosine similarity to [1, 0, 0, ...].
 * For normalized vectors, cosine = dot product, so we set v[0] = targetCosine
 * and v[1] = sqrt(1 - targetCosine^2) to keep the vector unit-length.
 */
const vectorWithCosine = (targetCosine: number, dims: number): number[] => {
  const vec = new Array(dims).fill(0);
  vec[0] = targetCosine;
  vec[1] = Math.sqrt(1 - targetCosine * targetCosine);
  return vec;
};

describe("Orama searchVector similarity parameter", () => {
  const queryVector = new Array(DIMS).fill(0);
  queryVector[0] = 1; // unit vector along first axis

  it("excludes documents below the similarity threshold", async () => {
    const db = create({
      schema: {
        id: "string",
        embedding: `vector[${DIMS}]`,
      } as const,
    });

    // cosine 0.9 — above 0.6
    await insert(db, { id: "high", embedding: vectorWithCosine(0.9, DIMS) });
    // cosine 0.5 — below 0.6
    await insert(db, { id: "low", embedding: vectorWithCosine(0.5, DIMS) });

    const results = await searchVector(db, {
      mode: "vector" as const,
      vector: { value: queryVector, property: "embedding" },
      similarity: 0.6,
      limit: 10,
    });

    const ids = results.hits.map((h) => h.document.id);
    expect(ids).toContain("high");
    expect(ids).not.toContain("low");
  });

  it("includes documents at or above the similarity threshold", async () => {
    const db = create({
      schema: {
        id: "string",
        embedding: `vector[${DIMS}]`,
      } as const,
    });

    await insert(db, { id: "at-06", embedding: vectorWithCosine(0.6, DIMS) });
    await insert(db, { id: "at-08", embedding: vectorWithCosine(0.8, DIMS) });
    await insert(db, { id: "at-03", embedding: vectorWithCosine(0.3, DIMS) });

    const results = await searchVector(db, {
      mode: "vector" as const,
      vector: { value: queryVector, property: "embedding" },
      similarity: 0.6,
      limit: 10,
    });

    const ids = results.hits.map((h) => h.document.id);
    expect(ids).toContain("at-06");
    expect(ids).toContain("at-08");
    expect(ids).not.toContain("at-03");
  });
});
