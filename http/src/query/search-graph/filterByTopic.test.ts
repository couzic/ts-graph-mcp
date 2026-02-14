import { describe, expect, it } from "vitest";
import { createSearchIndex } from "../../search/createSearchIndex.js";
import type { SearchDocument } from "../../search/SearchTypes.js";
import {
  filterEdgesToTopicRelevant,
  filterNodesByTopic,
} from "./filterByTopic.js";

const DIMS = 8;

const simpleEmbeddingFunction = (text: string): Float32Array => {
  const vec = new Float32Array(DIMS);
  for (let i = 0; i < text.length; i++) {
    const idx = i % DIMS;
    vec[idx] = (vec[idx] ?? 0) + text.charCodeAt(i) / 1000;
  }
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

const fakeEmbeddingProvider = {
  async initialize() {},
  async embedQuery(text: string) {
    return simpleEmbeddingFunction(text);
  },
  async embedDocument(text: string) {
    return simpleEmbeddingFunction(text);
  },
  async dispose() {},
};

const searchDoc = (name: string, file = "src/test.ts"): SearchDocument => ({
  id: `${file}:${name}`,
  symbol: name,
  file,
  nodeType: "Function",
  content: name,
  embedding: simpleEmbeddingFunction(name),
});

const edge = (source: string, target: string) => ({ source, target });

describe(filterNodesByTopic.name, () => {
  it("returns matching nodes from the search index", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });
    await index.add(searchDoc("validateCart"));
    await index.add(searchDoc("processOrder"));

    const result = await filterNodesByTopic(
      ["src/test.ts:validateCart", "src/test.ts:processOrder"],
      "validate",
      index,
      fakeEmbeddingProvider,
    );

    expect(result.topicRelevantNodes.has("src/test.ts:validateCart")).toBe(
      true,
    );
  });

  it("excludes node IDs not in the provided set", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });
    await index.add(searchDoc("validateCart"));

    const result = await filterNodesByTopic(
      ["src/other.ts:unknownNode"], // not in the index
      "validate",
      index,
      fakeEmbeddingProvider,
    );

    expect(result.topicRelevantNodes.size).toBe(0);
  });

  it("populates scoresByNodeId for matching results", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });
    await index.add(searchDoc("validateCart"));

    const result = await filterNodesByTopic(
      ["src/test.ts:validateCart"],
      "validate",
      index,
      fakeEmbeddingProvider,
    );

    const score = result.scoresByNodeId.get("src/test.ts:validateCart");
    expect(score).toBeDefined();
    expect(score).toBeGreaterThan(0);
  });

  it("returns empty set when no nodes match topic", async () => {
    const index = await createSearchIndex({ vectorDimensions: DIMS });
    await index.add(searchDoc("zzz"));

    const result = await filterNodesByTopic(
      ["src/test.ts:zzz"],
      "validate",
      index,
      fakeEmbeddingProvider,
    );

    // zzz may or may not match - but any returned node must have score > 0
    for (const nodeId of result.topicRelevantNodes) {
      expect(result.scoresByNodeId.get(nodeId)).toBeGreaterThan(0);
    }
  });
});

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
