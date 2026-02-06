import { describe, expect, it } from "vitest";
import { createFakeEmbeddingProvider } from "./createFakeEmbeddingProvider.js";

describe("createFakeEmbeddingProvider", () => {
  it("returns embedding with specified dimensions", async () => {
    const provider = createFakeEmbeddingProvider({ dimensions: 384 });
    const embedding = await provider.embedDocument("function validate() {}");

    expect(embedding).toHaveLength(384);
  });

  it("defaults to 384 dimensions", async () => {
    const provider = createFakeEmbeddingProvider();
    const embedding = await provider.embedDocument("test");

    expect(embedding).toHaveLength(384);
  });

  it("returns normalized unit vectors", async () => {
    const provider = createFakeEmbeddingProvider({ dimensions: 100 });
    const embedding = await provider.embedDocument("test input");

    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("generates deterministic embeddings for same input", async () => {
    const provider = createFakeEmbeddingProvider();
    const embedding1 = await provider.embedDocument("same input");
    const embedding2 = await provider.embedDocument("same input");

    expect(embedding1).toEqual(embedding2);
  });

  it("generates different embeddings for different inputs", async () => {
    const provider = createFakeEmbeddingProvider();
    const embedding1 = await provider.embedDocument("input one");
    const embedding2 = await provider.embedDocument("input two");

    expect(embedding1).not.toEqual(embedding2);
  });

  it("generates different embeddings for query vs document", async () => {
    const provider = createFakeEmbeddingProvider();
    const queryEmbedding = await provider.embedQuery("same text");
    const docEmbedding = await provider.embedDocument("same text");

    expect(queryEmbedding).not.toEqual(docEmbedding);
  });

  it("dispose is a no-op", async () => {
    const provider = createFakeEmbeddingProvider();
    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
