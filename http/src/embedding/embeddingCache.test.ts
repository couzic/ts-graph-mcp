import assert from "node:assert";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeContentHash,
  openEmbeddingCache,
} from "./embeddingCache.js";

describe("embeddingCache", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `embedding-cache-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("computeContentHash", () => {
    it("returns consistent hash for same content", () => {
      const content = "function foo() { return 42; }";
      const hash1 = computeContentHash(content);
      const hash2 = computeContentHash(content);
      expect(hash1).toBe(hash2);
    });

    it("returns different hash for different content", () => {
      const hash1 = computeContentHash("function foo() {}");
      const hash2 = computeContentHash("function bar() {}");
      expect(hash1).not.toBe(hash2);
    });

    it("returns 64-character hex string (SHA-256)", () => {
      const hash = computeContentHash("test");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("openEmbeddingCache", () => {
    it("creates embedding-cache directory if missing", () => {
      const cache = openEmbeddingCache(testDir, "nomic-embed");
      try {
        expect(existsSync(join(testDir, "embedding-cache"))).toBe(true);
      } finally {
        cache.close();
      }
    });

    it("creates database file for model", () => {
      const cache = openEmbeddingCache(testDir, "nomic-embed");
      try {
        expect(existsSync(join(testDir, "embedding-cache", "nomic-embed.db"))).toBe(true);
      } finally {
        cache.close();
      }
    });

    it("returns undefined for missing hash", () => {
      const cache = openEmbeddingCache(testDir, "nomic-embed");
      try {
        expect(cache.get("nonexistent")).toBeUndefined();
      } finally {
        cache.close();
      }
    });
  });

  describe("get/set operations", () => {
    it("retrieves stored vector", () => {
      const cache = openEmbeddingCache(testDir, "nomic-embed");
      try {
        const vector = [0.1, 0.2, 0.3, 0.4];
        cache.set("hash123", vector);
        const retrieved = cache.get("hash123");
        assert(retrieved !== undefined);
        expect(retrieved).toHaveLength(4);
        // Float32 has limited precision, check approximate equality
        expect(retrieved[0]).toBeCloseTo(0.1, 5);
        expect(retrieved[1]).toBeCloseTo(0.2, 5);
        expect(retrieved[2]).toBeCloseTo(0.3, 5);
        expect(retrieved[3]).toBeCloseTo(0.4, 5);
      } finally {
        cache.close();
      }
    });

    it("overwrites existing entry", () => {
      const cache = openEmbeddingCache(testDir, "nomic-embed");
      try {
        cache.set("hash123", [0.1, 0.2]);
        cache.set("hash123", [0.3, 0.4]);
        const retrieved = cache.get("hash123");
        assert(retrieved !== undefined);
        expect(retrieved).toHaveLength(2);
        expect(retrieved[0]).toBeCloseTo(0.3, 5);
        expect(retrieved[1]).toBeCloseTo(0.4, 5);
      } finally {
        cache.close();
      }
    });

    it("handles high-dimensional vectors", () => {
      const cache = openEmbeddingCache(testDir, "nomic-embed");
      try {
        const vector = Array.from({ length: 768 }, (_, i) => i * 0.001);
        cache.set("hash768", vector);
        const retrieved = cache.get("hash768");
        assert(retrieved !== undefined);
        expect(retrieved).toHaveLength(768);
        // Float32 has limited precision, spot check a few values
        expect(retrieved[0]!).toBeCloseTo(0, 5);
        expect(retrieved[100]!).toBeCloseTo(0.1, 5);
        expect(retrieved[500]!).toBeCloseTo(0.5, 5);
        expect(retrieved[767]!).toBeCloseTo(0.767, 5);
      } finally {
        cache.close();
      }
    });
  });

  describe("persistence", () => {
    it("persists data across connections", () => {
      const cache1 = openEmbeddingCache(testDir, "qwen3-0.6b");
      cache1.set("abc123", [0.1, 0.2, 0.3, 0.4]);
      cache1.set("def456", [0.5, 0.6, 0.7, 0.8]);
      cache1.close();

      const cache2 = openEmbeddingCache(testDir, "qwen3-0.6b");
      try {
        const vec1 = cache2.get("abc123");
        const vec2 = cache2.get("def456");
        expect(vec1).toHaveLength(4);
        expect(vec2).toHaveLength(4);
        // Float32 precision check
        expect(vec1![0]).toBeCloseTo(0.1, 5);
        expect(vec1![3]).toBeCloseTo(0.4, 5);
        expect(vec2![0]).toBeCloseTo(0.5, 5);
        expect(vec2![3]).toBeCloseTo(0.8, 5);
      } finally {
        cache2.close();
      }
    });

    it("isolates different models", () => {
      const cache1 = openEmbeddingCache(testDir, "model-a");
      cache1.set("hash1", [1.0, 2.0]);
      cache1.close();

      const cache2 = openEmbeddingCache(testDir, "model-b");
      try {
        expect(cache2.get("hash1")).toBeUndefined();
      } finally {
        cache2.close();
      }
    });
  });
});
