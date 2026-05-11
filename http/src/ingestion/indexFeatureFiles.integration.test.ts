import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbWriter } from "../db/DbWriter.js";
import type { Edge, Node } from "../db/Types.js";
import { createNoopEmbeddingProvider } from "../embedding/createNoopEmbeddingProvider.js";
import { createSearchIndex } from "../search/createSearchIndex.js";
import { indexFeatureFiles } from "./indexFeatureFiles.js";

const TEST_DIR = "/tmp/ts-graph-indexFeatureFiles-test";

const FEATURE_FILE_CONTENT = `# Authentication

**Status:** ✅ Implemented

**ID:** \`auth\`

## Login

> \`{#auth::login}\`

Users can log in with email and password.

## Registration

> \`{#auth::registration}\`

Users can register a new account.
`;

const createMockWriter = (): DbWriter & {
  nodes: Node[];
  edges: Edge[];
} => {
  const state = {
    nodes: [] as Node[],
    edges: [] as Edge[],
  };

  return {
    get nodes() {
      return state.nodes;
    },
    get edges() {
      return state.edges;
    },
    async addNodes(newNodes: Node[]): Promise<void> {
      state.nodes.push(...newNodes);
    },
    async addEdges(newEdges: Edge[]): Promise<void> {
      state.edges.push(...newEdges);
    },
    async removeFileNodes(): Promise<void> {},
    async deleteFile(): Promise<void> {},
    async clearAll(): Promise<void> {},
  };
};

describe("indexFeatureFiles with embedding disabled", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(join(TEST_DIR, "specs"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("indexes feature files with noop embedding provider", async () => {
    writeFileSync(
      join(TEST_DIR, "specs", "auth.feature.md"),
      FEATURE_FILE_CONTENT,
    );

    const writer = createMockWriter();
    const embeddingProvider = createNoopEmbeddingProvider();
    const searchIndex = await createSearchIndex({
      vectorSearchEnabled: false,
      vectorDimensions: 0,
    });

    const result = await indexFeatureFiles(TEST_DIR, writer, {
      searchIndex,
      embeddingProvider,
    });

    expect(result.filesProcessed).toBe(1);
    expect(result.nodesAdded).toBeGreaterThan(0);
    expect(result.specIdMap.size).toBe(2);
    expect(result.specIdMap.has("auth::login")).toBe(true);
    expect(result.specIdMap.has("auth::registration")).toBe(true);
  });

  it("writes nodes with null contentHash when embedding is disabled", async () => {
    writeFileSync(
      join(TEST_DIR, "specs", "auth.feature.md"),
      FEATURE_FILE_CONTENT,
    );

    const writer = createMockWriter();
    const embeddingProvider = createNoopEmbeddingProvider();
    const searchIndex = await createSearchIndex({
      vectorSearchEnabled: false,
      vectorDimensions: 0,
    });

    await indexFeatureFiles(TEST_DIR, writer, {
      searchIndex,
      embeddingProvider,
    });

    for (const node of writer.nodes) {
      expect(node.contentHash).toBeNull();
    }
  });

  it("adds documents to BM25-only search index", async () => {
    writeFileSync(
      join(TEST_DIR, "specs", "auth.feature.md"),
      FEATURE_FILE_CONTENT,
    );

    const writer = createMockWriter();
    const embeddingProvider = createNoopEmbeddingProvider();
    const searchIndex = await createSearchIndex({
      vectorSearchEnabled: false,
      vectorDimensions: 0,
    });

    await indexFeatureFiles(TEST_DIR, writer, {
      searchIndex,
      embeddingProvider,
    });

    const results = await searchIndex.search("authentication", { limit: 10 });

    expect(results.length).toBeGreaterThan(0);
  });
});
