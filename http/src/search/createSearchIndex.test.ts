import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSearchIndex,
  loadSearchIndexFromFile,
  preprocessForBM25,
  restoreSearchIndex,
} from "./createSearchIndex.js";
import type { SearchDocument } from "./SearchTypes.js";

// Simple embedding function for tests (just a normalized sum for similarity)
const mockEmbed = (text: string, dims: number): number[] => {
  const vec = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dims] += text.charCodeAt(i) / 1000;
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => v / (norm || 1));
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
  });

  it("indexes and searches documents", async () => {
    const index = await createSearchIndex();

    await index.add(doc("validateCart"));
    await index.add(doc("processOrder"));

    const results = await index.search("validate");

    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe("validateCart");
  });

  it("finds camelCase symbols by split words", async () => {
    const index = await createSearchIndex();

    await index.add(doc("validateCartItems"));

    const results = await index.search("cart items");

    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe("validateCartItems");
  });

  it("returns empty array for no matches", async () => {
    const index = await createSearchIndex();

    await index.add(doc("validateCart"));

    const results = await index.search("nonexistent");

    expect(results).toHaveLength(0);
  });

  it("respects limit option", async () => {
    const index = await createSearchIndex();

    await index.addBatch([
      doc("validateA"),
      doc("validateB"),
      doc("validateC"),
    ]);

    const results = await index.search("validate", { limit: 2 });

    expect(results).toHaveLength(2);
  });

  it("filters by nodeType", async () => {
    const index = await createSearchIndex();

    await index.add({ ...doc("formatDate"), nodeType: "Function" });
    await index.add({ ...doc("DateFormatter"), nodeType: "Class" });

    const results = await index.search("date", { nodeTypes: ["Function"] });

    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe("formatDate");
  });

  it("removes document by ID", async () => {
    const index = await createSearchIndex();

    const document = doc("validateCart");
    await index.add(document);

    await index.remove(document.id);

    const results = await index.search("validate");
    expect(results).toHaveLength(0);
  });

  it("removes all documents for a file", async () => {
    const index = await createSearchIndex();

    await index.add(doc("fnA", "src/utils.ts"));
    await index.add(doc("fnB", "src/utils.ts"));
    await index.add(doc("fnC", "src/other.ts"));

    await index.removeByFile("src/utils.ts");

    const results = await index.search("fn");
    expect(results).toHaveLength(1);
    expect(results[0]?.file).toBe("src/other.ts");
  });

  it("batch adds documents efficiently", async () => {
    const index = await createSearchIndex();

    await index.addBatch([doc("fnA"), doc("fnB"), doc("fnC")]);

    const count = await index.count();
    expect(count).toBe(3);
  });

  it("exports and restores index", async () => {
    const original = await createSearchIndex();

    await original.add(doc("validateCart"));
    await original.add(doc("processOrder"));

    const exported = await original.export();
    const restored = await restoreSearchIndex(exported);

    const results = await restored.search("validate");
    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe("validateCart");
  });

  describe("vector search", () => {
    const DIMS = 8;

    const docWithEmbed = (
      name: string,
      file = "src/test.ts",
    ): SearchDocument => ({
      id: `${file}:${name}`,
      symbol: name,
      file,
      nodeType: "Function",
      content: "",
      embedding: mockEmbed(name, DIMS),
    });

    it("creates index with vector support", async () => {
      const index = await createSearchIndex({ vectorDimensions: DIMS });
      expect(index.supportsVectors).toBe(true);
    });

    it("creates index without vector support by default", async () => {
      const index = await createSearchIndex();
      expect(index.supportsVectors).toBe(false);
    });

    it("throws when vector search on non-vector index", async () => {
      const index = await createSearchIndex();
      await index.add({ ...docWithEmbed("test"), embedding: undefined });

      await expect(
        index.search("test", {
          mode: "vector",
          vector: mockEmbed("test", DIMS),
        }),
      ).rejects.toThrow(
        "Vector search requires index created with vectorDimensions",
      );
    });

    it("throws when vector not provided for vector search", async () => {
      const index = await createSearchIndex({ vectorDimensions: DIMS });
      await index.add(docWithEmbed("test"));

      await expect(index.search("test", { mode: "vector" })).rejects.toThrow(
        "Vector search requires a query vector",
      );
    });

    it("performs vector search", async () => {
      const index = await createSearchIndex({ vectorDimensions: DIMS });

      await index.add(docWithEmbed("validateCart"));
      await index.add(docWithEmbed("processOrder"));

      const queryVector = mockEmbed("validateCart", DIMS);
      const results = await index.search("", {
        mode: "vector",
        vector: queryVector,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.symbol).toBe("validateCart");
    });

    it("performs hybrid search", async () => {
      const index = await createSearchIndex({ vectorDimensions: DIMS });

      await index.add(docWithEmbed("validateCart"));
      await index.add(docWithEmbed("processOrder"));

      const queryVector = mockEmbed("validate", DIMS);
      const results = await index.search("validate", {
        mode: "hybrid",
        vector: queryVector,
      });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("file persistence", () => {
    const TEST_DIR = "/tmp/ts-graph-search-persist-test";
    const INDEX_PATH = join(TEST_DIR, "index.json");

    beforeEach(() => {
      if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true });
      }
      mkdirSync(TEST_DIR, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true });
      }
    });

    it("saves and loads index from file", async () => {
      const original = await createSearchIndex();

      await original.add(doc("validateCart", "src/cart.ts"));
      await original.add(doc("processOrder", "src/order.ts"));

      await original.saveToFile(INDEX_PATH);

      const loaded = await loadSearchIndexFromFile(INDEX_PATH);

      expect(loaded).not.toBeNull();
      const results = await loaded!.search("validate");
      expect(results).toHaveLength(1);
      expect(results[0]?.symbol).toBe("validateCart");
    });

    it("returns null when file does not exist", async () => {
      const loaded = await loadSearchIndexFromFile("/nonexistent/path.json");
      expect(loaded).toBeNull();
    });

    it("preserves file tracking data after load", async () => {
      const original = await createSearchIndex();

      await original.add(doc("fnA", "src/utils.ts"));
      await original.add(doc("fnB", "src/utils.ts"));
      await original.add(doc("fnC", "src/other.ts"));

      await original.saveToFile(INDEX_PATH);

      const loaded = await loadSearchIndexFromFile(INDEX_PATH);
      expect(loaded).not.toBeNull();

      // Remove by file should work correctly (relies on docsByFile tracking)
      await loaded!.removeByFile("src/utils.ts");

      const results = await loaded!.search("fn");
      expect(results).toHaveLength(1);
      expect(results[0]?.file).toBe("src/other.ts");
    });

    it("saves and loads vector index", async () => {
      const DIMS = 8;
      const original = await createSearchIndex({ vectorDimensions: DIMS });

      await original.add({
        ...doc("validateCart"),
        embedding: mockEmbed("validateCart", DIMS),
      });

      await original.saveToFile(INDEX_PATH);

      const loaded = await loadSearchIndexFromFile(INDEX_PATH, {
        vectorDimensions: DIMS,
      });

      expect(loaded).not.toBeNull();
      expect(loaded!.supportsVectors).toBe(true);

      const queryVector = mockEmbed("validateCart", DIMS);
      const results = await loaded!.search("", {
        mode: "vector",
        vector: queryVector,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.symbol).toBe("validateCart");
    });

    it("returns null for corrupted file", async () => {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(INDEX_PATH, "not valid json {{{");

      const loaded = await loadSearchIndexFromFile(INDEX_PATH);
      expect(loaded).toBeNull();
    });
  });
});
