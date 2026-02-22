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

const vectorDimensions = 3;

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
    async deleteFile(_filePath: string) {
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
  let embeddingProvider: ReturnType<typeof createFakeEmbeddingProvider>;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
    writer = createFakeDbWriter();
    context = {
      filePath: "src/test.ts",
      package: "test",
    };
    embeddingProvider = createFakeEmbeddingProvider({
      dimensions: vectorDimensions,
    });
  });

  afterEach(() => {
    project.getSourceFiles().forEach((sf) => {
      project.removeSourceFile(sf);
    });
  });

  it("extracts nodes and edges from source file", async () => {
    const sourceFile = project.createSourceFile(
      "src/test.ts",
      `export function greet(name: string): string {
  return "Hello, " + name;
}`,
    );

    const result = await indexFile(sourceFile, context, writer, {
      embeddingProvider,
    });

    expect(result.nodesAdded).toBe(1);
    expect(writer.nodes).toHaveLength(1);
    assert(writer.nodes[0] !== undefined);
    expect(writer.nodes[0].name).toBe("greet");
  });

  describe("search index integration", () => {
    let searchIndex: SearchIndexWrapper;

    beforeEach(async () => {
      searchIndex = await createSearchIndex({ vectorDimensions });
    });

    it("adds nodes to search index", async () => {
      const sourceFile = project.createSourceFile(
        "src/test.ts",
        `export function validateUser(user: User): boolean {
  return user.name.length > 0;
}`,
      );

      await indexFile(sourceFile, context, writer, {
        searchIndex,
        embeddingProvider,
      });

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

      await indexFile(sourceFile, context, writer, {
        searchIndex,
        embeddingProvider,
      });

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

      await indexFile(sourceFile, context, writer, {
        searchIndex,
        embeddingProvider,
      });

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
      searchIndex = await createSearchIndex({ vectorDimensions });
    });

    it("generates embeddings when provider is present", async () => {
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
      const vector = await embeddingProvider.embedQuery("calculate sum");
      const results = await searchIndex.search("calculate", {
        vector,
      });
      expect(results).toHaveLength(1);
      assert(results[0] !== undefined);
      expect(results[0].symbol).toBe("calculateTotal");
    });

    it("generates different embeddings for different functions", async () => {
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

    it("strips class implementation on context overflow and retries", async () => {
      const embeddedContents: string[] = [];
      const overflowProvider = createFakeEmbeddingProvider({
        dimensions: vectorDimensions,
        maxContentLength: 200,
        onEmbed: (content) => embeddedContents.push(content),
      });

      const sourceFile = project.createSourceFile(
        "src/test.ts",
        `export class UserService {
  private db: Database;

  findUser(id: string): User {
    const result = this.db.query(id);
    return result;
  }

  saveUser(user: User): void {
    this.db.save(user);
    this.emit('saved', user);
  }
}`,
      );

      await indexFile(sourceFile, context, writer, {
        searchIndex,
        embeddingProvider: overflowProvider,
      });

      // Should have embedded: Class (retried with stripped) + 2 Methods = 3 nodes
      expect(embeddedContents).toHaveLength(3);

      // Find the class embedding (contains "class UserService")
      const classEmbedding = embeddedContents.find((c) =>
        c.includes("// Class: UserService"),
      );
      assert(classEmbedding !== undefined);

      // Class embedding should have stripped method bodies (after retry)
      expect(classEmbedding).toContain("findUser(id: string): User { ... }");
      expect(classEmbedding).toContain("saveUser(user: User): void { ... }");
      expect(classEmbedding).not.toContain("this.db.query");
      expect(classEmbedding).not.toContain("this.db.save");
    });

    it("always produces embeddings via progressive fallback (never fails)", async () => {
      const embeddedContents: string[] = [];
      // Very small limit - forces fallback to truncation
      const tinyProvider = createFakeEmbeddingProvider({
        dimensions: vectorDimensions,
        maxContentLength: 100,
        onEmbed: (content) => embeddedContents.push(content),
      });

      const sourceFile = project.createSourceFile(
        "src/test.ts",
        `export class UserService {
  private db: Database;
  private logger: Logger;
  private config: Config;

  constructor(db: Database, logger: Logger, config: Config) {
    this.db = db;
    this.logger = logger;
    this.config = config;
  }

  findUser(id: string): User {
    const result = this.db.query(id);
    this.logger.log("Found user");
    return result;
  }

  saveUser(user: User): void {
    this.db.save(user);
    this.logger.log("Saved user");
    this.config.validate();
  }
}`,
      );

      // Should NOT throw - must always succeed via fallback
      await indexFile(sourceFile, context, writer, {
        searchIndex,
        embeddingProvider: tinyProvider,
      });

      // All nodes should have embeddings (Class + 2 Methods = 3)
      expect(embeddedContents).toHaveLength(3);

      // All embeddings should fit within the limit (via truncation if needed)
      for (const content of embeddedContents) {
        expect(content.length).toBeLessThanOrEqual(100);
      }
    });

    it("embeds full function content beyond 50 lines when model can handle it", async () => {
      const embeddedContents: string[] = [];
      // Large context - no overflow expected
      const largeProvider = createFakeEmbeddingProvider({
        dimensions: vectorDimensions,
        maxContentLength: 10000,
        onEmbed: (content) => embeddedContents.push(content),
      });

      // Generate a function with 60 lines (exceeds MAX_SOURCE_LINES = 50)
      const functionLines = [
        "export function largeFunction(): void {",
        ...Array.from(
          { length: 58 },
          (_, i) => `  const line${i + 1} = ${i + 1};`,
        ),
        "}",
      ];
      const sourceCode = functionLines.join("\n");

      const sourceFile = project.createSourceFile("src/test.ts", sourceCode);

      await indexFile(sourceFile, context, writer, {
        searchIndex,
        embeddingProvider: largeProvider,
      });

      expect(embeddedContents).toHaveLength(1);
      const embedding = embeddedContents[0];
      assert(embedding !== undefined);

      // Content from line 55 should be included (not truncated at line 50)
      expect(embedding).toContain("line55");
      // Should NOT contain truncation marker
      expect(embedding).not.toContain("// ... truncated");
    });
  });
});
