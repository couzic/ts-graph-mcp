import { describe, expect, it } from "vitest";
import type { EdgeType } from "@ts-graph/shared";
import { computeBfsOrder } from "./computeBfsOrder.js";

const edge = (source: string, target: string, type: EdgeType = "CALLS"): { source: string; target: string; type: EdgeType } => ({
  source,
  target,
  type,
});

/** @spec tool::output.truncation */
describe("computeBfsOrder", () => {
  it("returns empty array for empty edges", () => {
    expect(computeBfsOrder([])).toEqual([]);
  });

  it("returns linear chain in order", () => {
    const edges = [edge("A", "B"), edge("B", "C")];
    expect(computeBfsOrder(edges)).toEqual(["A", "B", "C"]);
  });

  it("visits siblings before descendants (branching)", () => {
    const edges = [edge("A", "B"), edge("A", "C"), edge("B", "D")];
    expect(computeBfsOrder(edges)).toEqual(["A", "B", "C", "D"]);
  });

  it("visits direct children before deep descendants", () => {
    // A -> B, A -> C, A -> D, B -> E, E -> F, F -> G
    const edges = [
      edge("A", "B"),
      edge("A", "C"),
      edge("A", "D"),
      edge("B", "E"),
      edge("E", "F"),
      edge("F", "G"),
    ];
    const order = computeBfsOrder(edges);
    // A's direct children (B, C, D) must all appear before B's descendants (E, F, G)
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("E"));
    expect(order.indexOf("D")).toBeLessThan(order.indexOf("E"));
    expect(order).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  it("visits converging callers before deeper nodes", () => {
    // A -> C, B -> C, C -> D (backward traversal shape)
    const edges = [edge("A", "C"), edge("B", "C"), edge("C", "D")];
    const order = computeBfsOrder(edges);
    // A and B are roots, visited before C and D
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("D"));
  });

  it("handles disconnected components", () => {
    const edges = [edge("A", "B"), edge("C", "D")];
    const order = computeBfsOrder(edges);
    expect(order).toHaveLength(4);
    // Both roots visited, then their targets
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("D"));
  });

  it("handles cycles", () => {
    const edges = [edge("A", "B"), edge("B", "A")];
    const order = computeBfsOrder(edges);
    expect(order).toHaveLength(2);
    expect(order).toContain("A");
    expect(order).toContain("B");
  });

  it("handles multiple roots", () => {
    const edges = [edge("A", "C"), edge("B", "C")];
    const order = computeBfsOrder(edges);
    expect(order).toEqual(["A", "B", "C"]);
  });

  /** @spec tool::query.edge-priority-truncation */
  it("treats IMPLEMENTS edges as bidirectional in adjacency", () => {
    // F --TAKES--> I, C --IMPLEMENTS--> I
    // Without bidirectional: C is a root (no incoming), visited early
    // With bidirectional: I has reverse adjacency to C, so C is visited after I
    const edges = [
      edge("F", "I", "TAKES"),
      edge("C", "I", "IMPLEMENTS"),
    ];
    const order = computeBfsOrder(edges);
    expect(order.indexOf("F")).toBeLessThan(order.indexOf("I"));
    expect(order.indexOf("I")).toBeLessThan(order.indexOf("C"));
  });

  /** @spec tool::query.edge-priority-truncation */
  it("treats EXTENDS edges as bidirectional in adjacency", () => {
    // F --CALLS--> Base, Child --EXTENDS--> Base
    const edges = [
      edge("F", "Base", "CALLS"),
      edge("Child", "Base", "EXTENDS"),
    ];
    const order = computeBfsOrder(edges);
    expect(order.indexOf("F")).toBeLessThan(order.indexOf("Base"));
    expect(order.indexOf("Base")).toBeLessThan(order.indexOf("Child"));
  });

  /** @spec tool::query.edge-priority-truncation */
  it("keeps direct CALLS neighbors before reverse IMPLEMENTS nodes", () => {
    // F --CALLS--> A, F --CALLS--> B, F --TAKES--> I, C --IMPLEMENTS--> I, D --IMPLEMENTS--> I
    const edges = [
      edge("F", "A", "CALLS"),
      edge("F", "B", "CALLS"),
      edge("F", "I", "TAKES"),
      edge("C", "I", "IMPLEMENTS"),
      edge("D", "I", "IMPLEMENTS"),
    ];
    const order = computeBfsOrder(edges);
    // F's direct neighbors (A, B, I) all before implementations (C, D)
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("I")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("I")).toBeLessThan(order.indexOf("D"));
  });
});
