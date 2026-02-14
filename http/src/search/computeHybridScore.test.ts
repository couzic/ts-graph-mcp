import { describe, expect, it } from "vitest";
import { computeHybridScore } from "./computeHybridScore.js";

describe(computeHybridScore.name, () => {
  describe("cosine-only (no BM25 in query)", () => {
    it("returns halved cosine score", () => {
      expect(computeHybridScore(0, 0, 0.7)).toBe(0.35);
    });

    it("higher cosine → higher score", () => {
      const high = computeHybridScore(0, 0, 0.9);
      const low = computeHybridScore(0, 0, 0.65);
      expect(high).toBeGreaterThan(low);
    });
  });

  describe("cosine weight is consistent", () => {
    it("cosine contribution is the same regardless of BM25 context", () => {
      const cosineOnly = computeHybridScore(0, 0, 0.7);
      const withBm25Context = computeHybridScore(0, 5, 0.7);
      expect(cosineOnly).toBe(withBm25Context);
    });
  });

  describe("hybrid (BM25 matches exist)", () => {
    it("BM25 match scores higher than same cosine without BM25", () => {
      const withBm25 = computeHybridScore(5, 10, 0.7);
      const withoutBm25 = computeHybridScore(0, 10, 0.7);
      expect(withBm25).toBeGreaterThan(withoutBm25);
    });

    it("stronger BM25 match → higher boost", () => {
      const strongBm25 = computeHybridScore(10, 10, 0.7);
      const weakBm25 = computeHybridScore(2, 10, 0.7);
      expect(strongBm25).toBeGreaterThan(weakBm25);
    });

    it("BM25 + high cosine > BM25 + low cosine", () => {
      const highCosine = computeHybridScore(5, 10, 0.9);
      const lowCosine = computeHybridScore(5, 10, 0.3);
      expect(highCosine).toBeGreaterThan(lowCosine);
    });
  });

  describe("score remains in 0-1 range", () => {
    it("max BM25 + max cosine does not exceed 1", () => {
      expect(computeHybridScore(10, 10, 1.0)).toBeLessThanOrEqual(1.0);
    });

    it("zero everything returns 0", () => {
      expect(computeHybridScore(0, 0, 0)).toBe(0);
    });
  });
});
