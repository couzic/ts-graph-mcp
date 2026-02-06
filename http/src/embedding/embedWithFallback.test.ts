import { describe, expect, it } from "vitest";
import { createFakeEmbeddingProvider } from "./createFakeEmbeddingProvider.js";
import type { EmbeddingCacheConnection } from "./embeddingCache.js";
import { embedWithFallback } from "./embedWithFallback.js";

const dimensions = 3;

const createMapCache = (): EmbeddingCacheConnection => {
  const store = new Map<string, Float32Array>();
  return {
    get(hash: string) {
      return store.get(hash);
    },
    getBatch(hashes: string[]) {
      const map = new Map<string, Float32Array>();
      for (const hash of hashes) {
        const val = store.get(hash);
        if (val) {
          map.set(hash, val);
        }
      }
      return map;
    },
    set(hash: string, embedding: Float32Array) {
      store.set(hash, embedding);
    },
    close() {},
  };
};

describe(embedWithFallback.name, () => {
  const provider = createFakeEmbeddingProvider({ dimensions });

  it("embeds full content when it fits", async () => {
    const result = await embedWithFallback(
      "Function",
      "foo",
      "src/utils.ts",
      "function foo() { return 42; }",
      provider,
    );
    expect(result.embedding).toBeInstanceOf(Float32Array);
    expect(result.embedding).toHaveLength(dimensions);
    expect(result.contentHash).toBeTruthy();
  });

  it("returns cached embedding on cache hit", async () => {
    const cache = createMapCache();
    const cachedVector = new Float32Array([1, 2, 3]);

    // First call populates cache
    const firstResult = await embedWithFallback(
      "Function",
      "bar",
      "src/bar.ts",
      "function bar() {}",
      provider,
      cache,
    );

    // Overwrite cache entry with known vector
    cache.set(firstResult.contentHash, cachedVector);

    // Second call with same content returns cached vector
    const secondResult = await embedWithFallback(
      "Function",
      "bar",
      "src/bar.ts",
      "function bar() {}",
      provider,
      cache,
    );
    expect(secondResult.embedding).toBe(cachedVector);
  });

  it("stores embedding in cache after generation", async () => {
    const cache = createMapCache();

    const result = await embedWithFallback(
      "Function",
      "baz",
      "src/baz.ts",
      "function baz() {}",
      provider,
      cache,
    );

    const cached = cache.get(result.contentHash);
    expect(cached).toBeDefined();
    expect(cached).toEqual(result.embedding);
  });

  it("falls back to truncation on context overflow", async () => {
    const smallProvider = createFakeEmbeddingProvider({
      dimensions,
      maxContentLength: 100,
    });
    const longSnippet = `function big() {\n${"  x();\n".repeat(50)}}`;

    const result = await embedWithFallback(
      "Function",
      "big",
      "src/big.ts",
      longSnippet,
      smallProvider,
    );

    expect(result.embedding).toBeInstanceOf(Float32Array);
    expect(result.embedding).toHaveLength(dimensions);
  });

  it("tries stripped implementation for Class nodes before truncation", async () => {
    const embeddedContents: string[] = [];
    const smallProvider = createFakeEmbeddingProvider({
      dimensions,
      maxContentLength: 200,
      onEmbed: (content) => embeddedContents.push(content),
    });

    const classSnippet = `class MyService {
  private db: Database;

  async findUser(id: string): Promise<User> {
    const result = await this.db.query('SELECT * FROM users WHERE id = ?', [id]);
    return result.rows[0];
  }
}`;

    await embedWithFallback(
      "Class",
      "MyService",
      "src/service.ts",
      classSnippet,
      smallProvider,
    );

    // The stripped version (with "{ ... }") should have been attempted
    const strippedAttempt = embeddedContents.find((c) => c.includes("{ ... }"));
    expect(strippedAttempt).toBeDefined();
  });

  it("skips class stripping for non-Class node types", async () => {
    const embeddedContents: string[] = [];
    const smallProvider = createFakeEmbeddingProvider({
      dimensions,
      maxContentLength: 200,
      onEmbed: (content) => embeddedContents.push(content),
    });

    const longSnippet = `function big() {\n${"  x();\n".repeat(100)}}`;

    await embedWithFallback(
      "Function",
      "big",
      "src/big.ts",
      longSnippet,
      smallProvider,
    );

    const strippedAttempt = embeddedContents.find((c) => c.includes("{ ... }"));
    expect(strippedAttempt).toBeUndefined();
  });

  it("falls back to metadata-only when snippet is too long to truncate", async () => {
    const embeddedContents: string[] = [];
    const tinyProvider = createFakeEmbeddingProvider({
      dimensions,
      maxContentLength: 60,
      onEmbed: (content) => embeddedContents.push(content),
    });

    const longSnippet = "x".repeat(500);

    const result = await embedWithFallback(
      "Function",
      "huge",
      "src/huge.ts",
      longSnippet,
      tinyProvider,
    );

    expect(result.embedding).toHaveLength(dimensions);
    // Last successful embed should be metadata-only
    const lastEmbed = embeddedContents[embeddedContents.length - 1];
    expect(lastEmbed).toContain("// Function: huge");
    expect(lastEmbed).toContain("// File: src/huge.ts");
  });

  it("propagates non-overflow errors", async () => {
    const brokenProvider = createFakeEmbeddingProvider({ dimensions });
    brokenProvider.embedDocument = async () => {
      throw new Error("network timeout");
    };

    await expect(
      embedWithFallback(
        "Function",
        "fail",
        "src/fail.ts",
        "function fail() {}",
        brokenProvider,
      ),
    ).rejects.toThrow("network timeout");
  });

  it("throws when even metadata-only fails", async () => {
    const alwaysFailProvider = createFakeEmbeddingProvider({ dimensions });
    alwaysFailProvider.embedDocument = async () => {
      throw new Error("Input is longer than the context size");
    };

    await expect(
      embedWithFallback(
        "Function",
        "doom",
        "src/doom.ts",
        "function doom() {}",
        alwaysFailProvider,
      ),
    ).rejects.toThrow(
      "Failed to embed src/doom.ts:doom even with minimal content",
    );
  });
});
