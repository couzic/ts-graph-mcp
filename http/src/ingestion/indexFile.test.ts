import assert from "node:assert";
import { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbWriter } from "../db/DbWriter.js";
import type { Edge, Node } from "../db/Types.js";
import { createFakeEmbeddingProvider } from "../embedding/createFakeEmbeddingProvider.js";
import {
  createSearchIndex,
  type SearchIndexWrapper,
} from "../search/createSearchIndex.js";
import type { EdgeExtractionContext } from "./extract/edges/EdgeExtractionContext.js";
import { indexFile } from "./indexFile.js";

/**
 * Create a fake DbWriter for testing.
 */
const createFakeDbWriter = (): DbWriter & {
  nodes: Node[];
  edges: Edge[];
} => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  return {
    nodes,
    edges,
    async addNodes(newNodes: Node[]) {
      nodes.push(...newNodes);
    },
    async addEdges(newEdges: Edge[]) {
      edges.push(...newEdges);
    },
    async removeFileNodes(_filePath: string) {
      // Not used in these tests
    },
    async clearAll() {
      nodes.length = 0;
      edges.length = 0;
    },
  };
};

describe("indexFile", () => {
  let project: Project;
  let writer: ReturnType<typeof createFakeDbWriter>;
  let context: EdgeExtractionContext;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
    writer = createFakeDbWriter();
    context = {
      filePath: "src/test.ts",
      package: "test",
    };
  });

  afterEach(() => {
    project.getSourceFiles().forEach((sf) => project.removeSourceFile(sf));
  });

  it("extracts nodes and edges from source file", async () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `export function greet(name: string): string {
  return "Hello, " + name;
}`,
    );

    const result = await indexFile(sourceFile, context, writer);

    expect(result.nodesAdded).toBe(1);
    expect(writer.nodes).toHaveLength(1);
    assert(writer.nodes[0] !== undefined);
    expect(writer.nodes[0].name).toBe("greet");
  });

  describe("search index integration", () => {
    let searchIndex: SearchIndexWrapper;

    beforeEach(async () => {
      searchIndex = await createSearchIndex();
    });

    it("adds nodes to search index", async () => {
      const sourceFile = project.createSourceFile(
        "src/test.ts",
        `export function validateUser(user: User): boolean {
  return user.name.length > 0;
}`,
      );

      await indexFile(sourceFile, context, writer, { searchIndex });

      const count = await searchIndex.count();
      expect(count).toBe(1);

      const results = await searchIndex.search("validate");
      expect(results).toHaveLength(1);
      assert(results[0] !== undefined);
      expect(results[0].symbol).toBe("validateUser");
    });

    it("includes source snippet in search document", async () => {
      const sourceFile = project.createSourceFile(
        "src/test.ts",
        `export function processOrder(order: Order): void {
  // Important business logic
  console.log(order);
}`,
      );

      await indexFile(sourceFile, context, writer, { searchIndex });

      // Source content is used in BM25 search
      const results = await searchIndex.search("processOrder");
      expect(results).toHaveLength(1);
      assert(results[0] !== undefined);
      expect(results[0].symbol).toBe("processOrder");
    });

    it("handles const and type with same name (declaration merging)", async () => {
      const sourceFile = project.createSourceFile(
        "src/test.ts",
        `export const DATE_FORMAT = 'ss' as const;
export type DATE_FORMAT = typeof DATE_FORMAT;`,
      );

      await indexFile(sourceFile, context, writer, { searchIndex });

      // Both the const (Variable) and type (TypeAlias) should be indexed
      const count = await searchIndex.count();
      expect(count).toBe(2);

      expect(writer.nodes).toHaveLength(2);
      const nodeTypes = writer.nodes.map((n) => n.type).sort();
      expect(nodeTypes).toEqual(["TypeAlias", "Variable"]);
    });
  });

  describe("embedding integration", () => {
    let searchIndex: SearchIndexWrapper;

    beforeEach(async () => {
      // Create index with vector support
      searchIndex = await createSearchIndex({ vectorDimensions: 384 });
    });

    it("generates embeddings when provider is present", async () => {
      const embeddingProvider = createFakeEmbeddingProvider({
        dimensions: 384,
      });
      const sourceFile = project.createSourceFile(
        "src/test.ts",
        `export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}`,
      );

      await indexFile(sourceFile, context, writer, {
        searchIndex,
        embeddingProvider,
      });

      const count = await searchIndex.count();
      expect(count).toBe(1);

      // Vector search should work
      const queryEmbedding =
        await embeddingProvider.embedQuery("calculate sum");
      const results = await searchIndex.search("calculate", {
        mode: "hybrid",
        vector: queryEmbedding,
      });
      expect(results).toHaveLength(1);
      assert(results[0] !== undefined);
      expect(results[0].symbol).toBe("calculateTotal");
    });

    it("generates different embeddings for different functions", async () => {
      const embeddingProvider = createFakeEmbeddingProvider({
        dimensions: 384,
      });
      const sourceFile = project.createSourceFile(
        "src/test.ts",
        `export function validateInput(input: string): boolean {
  return input.length > 0;
}

export function processData(data: Data): Result {
  return transform(data);
}`,
      );

      await indexFile(sourceFile, context, writer, {
        searchIndex,
        embeddingProvider,
      });

      const count = await searchIndex.count();
      expect(count).toBe(2);
    });

    it("works without embedding provider (fulltext only)", async () => {
      // Create a non-vector index for fulltext-only search
      const textOnlyIndex = await createSearchIndex();
      const sourceFile = project.createSourceFile(
        "src/test.ts",
        `export function searchUsers(query: string): User[] {
  return users.filter(u => u.name.includes(query));
}`,
      );

      await indexFile(sourceFile, context, writer, {
        searchIndex: textOnlyIndex,
      });

      const count = await textOnlyIndex.count();
      expect(count).toBe(1);

      // Fulltext search should still work
      const results = await textOnlyIndex.search("search");
      expect(results).toHaveLength(1);
    });
  });
});
