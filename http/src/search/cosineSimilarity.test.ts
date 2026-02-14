import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "./cosineSimilarity.js";

describe(cosineSimilarity.name, () => {
  it("returns 1 for identical vectors", () => {
    const v = new Float32Array([3, 4]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it("returns 1 for identical unit vectors", () => {
    const v = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it("returns same result regardless of vector magnitude", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    const aScaled = new Float32Array([10, 20, 30]);
    const bScaled = new Float32Array([40, 50, 60]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(
      cosineSimilarity(aScaled, bScaled),
    );
  });

  it("equals dot product for normalized vectors", () => {
    // Normalized vectors: magnitude = 1
    const a = new Float32Array([0.6, 0.8]);
    const b = new Float32Array([0.8, 0.6]);
    const dot = 0.6 * 0.8 + 0.8 * 0.6; // 0.96
    expect(cosineSimilarity(a, b)).toBeCloseTo(dot);
  });

  it("handles non-normalized vectors correctly", () => {
    const a = new Float32Array([3, 4]); // magnitude = 5
    const b = new Float32Array([4, 3]); // magnitude = 5
    // dot = 12+12 = 24, mag = 5*5 = 25
    expect(cosineSimilarity(a, b)).toBeCloseTo(24 / 25);
  });

  it("returns 0 for zero vector", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});
