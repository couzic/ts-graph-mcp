import { describe, expect, it } from "vitest";
import { createNoopEmbeddingProvider } from "./createNoopEmbeddingProvider.js";

/** @spec configuration::embedding.disabled */
describe(createNoopEmbeddingProvider.name, () => {
  it("is not enabled", () => {
    const provider = createNoopEmbeddingProvider();
    expect(provider.enabled).toBe(false);
  });

  it("has dimensions 0", () => {
    const provider = createNoopEmbeddingProvider();
    expect(provider.dimensions).toBe(0);
  });

  it("initialize resolves", async () => {
    const provider = createNoopEmbeddingProvider();
    await provider.initialize();
  });

  it("dispose resolves", async () => {
    const provider = createNoopEmbeddingProvider();
    await provider.dispose();
  });

  it("embedDocument throws", async () => {
    const provider = createNoopEmbeddingProvider();
    await expect(provider.embedDocument("test")).rejects.toThrow(
      "Embedding is disabled",
    );
  });

  it("embedQuery throws", async () => {
    const provider = createNoopEmbeddingProvider();
    await expect(provider.embedQuery("test")).rejects.toThrow(
      "Embedding is disabled",
    );
  });
});
