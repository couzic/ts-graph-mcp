import { describe, expect, it } from "vitest";
import {
  createSearchIndex,
  preprocessForBM25,
  restoreSearchIndex,
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
