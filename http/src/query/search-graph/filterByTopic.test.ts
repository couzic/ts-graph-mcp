import { describe, expect, it } from "vitest";
import { filterEdgesToTopicRelevant } from "./filterByTopic.js";

const edge = (source: string, target: string) => ({ source, target });

describe(filterEdgesToTopicRelevant.name, () => {
  it("keeps edges leading to a topic-relevant node", () => {
    const edges = [edge("A", "B"), edge("B", "C")];
    const topicRelevant = new Set(["C"]);

    const result = filterEdgesToTopicRelevant(edges, topicRelevant, "A");

    expect(result).toEqual([edge("A", "B"), edge("B", "C")]);
  });

  it("removes edges not leading to a topic-relevant node", () => {
    const edges = [edge("A", "B"), edge("A", "C")];
    const topicRelevant = new Set(["C"]);

    const result = filterEdgesToTopicRelevant(edges, topicRelevant, "A");

    expect(result).toEqual([edge("A", "C")]);
  });

  it("always keeps edges from start node to topic-relevant node", () => {
    const edges = [edge("A", "B")];
    const topicRelevant = new Set(["B"]);

    const result = filterEdgesToTopicRelevant(edges, topicRelevant, "A");

    expect(result).toEqual([edge("A", "B")]);
  });

  it("removes all edges when no path leads to topic-relevant node", () => {
    const edges = [edge("A", "B"), edge("B", "C")];
    const topicRelevant = new Set(["X"]);

    const result = filterEdgesToTopicRelevant(edges, topicRelevant, "A");

    expect(result).toEqual([]);
  });

  it("handles branching where only one branch leads to topic", () => {
    // A → B → D (topic)
    // A → C → E (not topic)
    const edges = [
      edge("A", "B"),
      edge("B", "D"),
      edge("A", "C"),
      edge("C", "E"),
    ];
    const topicRelevant = new Set(["D"]);

    const result = filterEdgesToTopicRelevant(edges, topicRelevant, "A");

    expect(result).toEqual([edge("A", "B"), edge("B", "D")]);
  });

  it("handles diamond graph where both paths lead to topic", () => {
    // A → B → D (topic)
    // A → C → D (topic)
    const edges = [
      edge("A", "B"),
      edge("A", "C"),
      edge("B", "D"),
      edge("C", "D"),
    ];
    const topicRelevant = new Set(["D"]);

    const result = filterEdgesToTopicRelevant(edges, topicRelevant, "A");

    expect(result).toEqual([
      edge("A", "B"),
      edge("A", "C"),
      edge("B", "D"),
      edge("C", "D"),
    ]);
  });
});
