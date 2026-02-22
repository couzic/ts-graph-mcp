import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteWriter } from "../../db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import type { Edge, FunctionNode } from "../../db/Types.js";
import { createFakeEmbeddingCache } from "../../embedding/createFakeEmbeddingCache.js";
import { createFakeEmbeddingProvider } from "../../embedding/createFakeEmbeddingProvider.js";
import {
  createSearchIndex,
  type SearchIndexWrapper,
} from "../../search/createSearchIndex.js";
import { populateSearchIndex } from "../../search/populateSearchIndex.js";
import type { SearchDocument } from "../../search/SearchTypes.js";
import { formatMcpFromResult } from "../shared/formatFromResult.js";
import type { QueryResult } from "../shared/QueryResult.js";
import { searchGraph } from "./searchGraph.js";

const toMcp = (result: QueryResult): string => formatMcpFromResult(result);

const fn = (name: string, file = "src/test.ts"): FunctionNode => ({
  id: `${file}:Function:${name}`,
  type: "Function",
  name,
  package: "main",
  filePath: file,
  startLine: 1,
  endLine: 10,
  exported: true,
  contentHash: `hash-${name}`,
  snippet: `function ${name}() { return true; }`,
});

const calls = (from: string, to: string): Edge => ({
  source: from,
  target: to,
  type: "CALLS",
});

const vectorDimensions = 3;

describe(searchGraph.name, () => {
  let db: Database.Database;
  const embeddingCache = createFakeEmbeddingCache(vectorDimensions);
  const embeddingProvider = createFakeEmbeddingProvider({
    dimensions: vectorDimensions,
  });

  beforeEach(() => {
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("returns error when no constraints provided", async () => {
    const result = await searchGraph(db, {}, { embeddingProvider });
    expect(toMcp(result)).toContain("At least one of");
  });

  describe("forward traversal (from only)", () => {
    it("finds dependencies via from.symbol", async () => {
      const writer = createSqliteWriter(db);
      const nodeA = fn("fnA");
      const nodeB = fn("fnB");

      await writer.addNodes([nodeA, nodeB]);
      await writer.addEdges([calls(nodeA.id, nodeB.id)]);

      const result = await searchGraph(
        db,
        { from: { symbol: "fnA" } },
        { embeddingProvider },
      );

      expect(toMcp(result)).toContain("fnA");
      expect(toMcp(result)).toContain("fnB");
      expect(toMcp(result)).toContain("CALLS");
    });
  });

  describe("backward traversal (to only)", () => {
    it("finds dependents via to.symbol", async () => {
      const writer = createSqliteWriter(db);
      const nodeA = fn("fnA");
      const nodeB = fn("fnB");

      await writer.addNodes([nodeA, nodeB]);
      await writer.addEdges([calls(nodeA.id, nodeB.id)]);

      const result = await searchGraph(
        db,
        { to: { symbol: "fnB" } },
        { embeddingProvider },
      );

      expect(toMcp(result)).toContain("fnA");
      expect(toMcp(result)).toContain("fnB");
      expect(toMcp(result)).toContain("CALLS");
    });
  });

  describe("path finding (from and to)", () => {
    it("finds path between symbols", async () => {
      const writer = createSqliteWriter(db);
      const nodeA = fn("fnA");
      const nodeB = fn("fnB");
      const nodeC = fn("fnC");

      await writer.addNodes([nodeA, nodeB, nodeC]);
      await writer.addEdges([
        calls(nodeA.id, nodeB.id),
        calls(nodeB.id, nodeC.id),
      ]);

      const result = await searchGraph(
        db,
        { from: { symbol: "fnA" }, to: { symbol: "fnC" } },
        { embeddingProvider },
      );

      expect(toMcp(result)).toContain("fnA");
      expect(toMcp(result)).toContain("fnB");
      expect(toMcp(result)).toContain("fnC");
    });
  });

  describe("semantic search (topic)", () => {
    let searchIndex: SearchIndexWrapper;

    beforeEach(async () => {
      searchIndex = await createSearchIndex({ vectorDimensions });
    });

    it("returns guidance when search index not provided", async () => {
      const result = await searchGraph(
        db,
        { topic: "validation" },
        { embeddingProvider },
      );

      expect(toMcp(result)).toContain("requires embeddings");
    });

    it("returns graph format when topic symbols have connections", async () => {
      const writer = createSqliteWriter(db);
      await writer.addNodes([
        fn("validateInput"),
        fn("validateOutput"),
        fn("processData"),
      ]);
      // Add edge between validation functions
      await writer.addEdges([
        calls(
          "src/test.ts:Function:validateInput",
          "src/test.ts:Function:validateOutput",
        ),
      ]);

      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { topic: "validate" },
        { searchIndex, embeddingProvider },
      );

      // Should contain graph structure
      expect(toMcp(result)).toContain("## Graph");
      expect(toMcp(result)).toContain("validateInput");
      expect(toMcp(result)).toContain("validateOutput");
      expect(toMcp(result)).toContain("CALLS");
      expect(toMcp(result)).not.toContain("processData");
    });

    it("returns flat list when topic symbols have no connections", async () => {
      const writer = createSqliteWriter(db);
      await writer.addNodes([fn("validateInput"), fn("validateOutput")]);
      // No edges between them

      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { topic: "validate" },
        { searchIndex, embeddingProvider },
      );

      // Should indicate no connections
      expect(toMcp(result)).toContain("No connections found");
      expect(toMcp(result)).toContain("validateInput");
      expect(toMcp(result)).toContain("validateOutput");
    });

    it("finds bridge nodes connecting topic-matched seeds", async () => {
      const writer = createSqliteWriter(db);
      // validateInput and validateOutput match "validate"
      // processData does NOT match, but bridges the two seeds
      await writer.addNodes([
        fn("validateInput"),
        fn("processData"),
        fn("validateOutput"),
      ]);
      await writer.addEdges([
        calls(
          "src/test.ts:Function:validateInput",
          "src/test.ts:Function:processData",
        ),
        calls(
          "src/test.ts:Function:processData",
          "src/test.ts:Function:validateOutput",
        ),
      ]);

      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { topic: "validate" },
        { searchIndex, embeddingProvider },
      );

      const output = toMcp(result);
      expect(output).toContain("## Graph");
      expect(output).toContain("validateInput");
      expect(output).toContain("processData");
      expect(output).toContain("validateOutput");
    });

    it("returns message when no symbols match topic", async () => {
      const writer = createSqliteWriter(db);
      await writer.addNodes([fn("processData")]);

      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { topic: "authentication" },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("No symbols found matching");
    });
  });

  describe("query-based endpoint resolution", () => {
    let searchIndex: SearchIndexWrapper;

    beforeEach(async () => {
      searchIndex = await createSearchIndex({ vectorDimensions });
    });

    it("returns helpful error when from.query resolves no symbols", async () => {
      // searchIndex is empty — no documents match the query
      const result = await searchGraph(
        db,
        { from: { query: "nonexistent" } },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("No symbols found matching query");
    });

    it("returns helpful error when to.query resolves no symbols", async () => {
      // searchIndex is empty — no documents match the query
      const result = await searchGraph(
        db,
        { to: { query: "nonexistent" } },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("No symbols found matching query");
    });

    it("returns multiple matching symbols for from.query", async () => {
      const writer = createSqliteWriter(db);
      // Multiple symbols matching "validate"
      const validateA = fn("validateInput");
      const validateB = fn("validateOutput");
      const unrelated = fn("processData");

      await writer.addNodes([validateA, validateB, unrelated]);
      // Each validation function calls the unrelated function
      await writer.addEdges([
        calls(validateA.id, unrelated.id),
        calls(validateB.id, unrelated.id),
      ]);
      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { from: { query: "validate" } },
        { searchIndex, embeddingProvider },
      );

      // Should return BOTH matching symbols as start nodes
      expect(toMcp(result)).toContain("validateInput");
      expect(toMcp(result)).toContain("validateOutput");
      expect(toMcp(result)).toContain("processData");
    });

    it("returns multiple matching symbols for to.query", async () => {
      const writer = createSqliteWriter(db);
      // Multiple symbols matching "save"
      const saveA = fn("saveUser");
      const saveB = fn("saveOrder");
      const caller = fn("handleRequest");

      await writer.addNodes([saveA, saveB, caller]);
      // The caller calls both save functions
      await writer.addEdges([
        calls(caller.id, saveA.id),
        calls(caller.id, saveB.id),
      ]);
      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { to: { query: "save" } },
        { searchIndex, embeddingProvider },
      );

      // Should return BOTH matching symbols as end nodes
      expect(toMcp(result)).toContain("saveUser");
      expect(toMcp(result)).toContain("saveOrder");
      expect(toMcp(result)).toContain("handleRequest");
    });

    it("finds paths between multiple resolved endpoints (from.query + to.query)", async () => {
      const writer = createSqliteWriter(db);
      // Two "validate" functions and two "save" functions
      const validateA = fn("validateInput", "src/input.ts");
      const validateB = fn("validateOutput", "src/output.ts");
      const saveA = fn("saveUser", "src/user.ts");
      const saveB = fn("saveOrder", "src/order.ts");
      const middle = fn("processData");

      await writer.addNodes([validateA, validateB, saveA, saveB, middle]);
      // validateInput -> processData -> saveUser (path exists)
      // validateOutput has no path to any save function
      await writer.addEdges([
        calls(validateA.id, middle.id),
        calls(middle.id, saveA.id),
      ]);
      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { from: { query: "validate" }, to: { query: "save" } },
        { searchIndex, embeddingProvider },
      );

      const output = toMcp(result);
      expect(output).toContain("## Graph");
      expect(output).toContain("validateInput");
      expect(output).toContain("processData");
      expect(output).toContain("saveUser");
    });

    it("returns message when no paths exist between resolved endpoints", async () => {
      const writer = createSqliteWriter(db);
      // Multiple validate and save functions, but no edges connecting them
      const validateA = fn("validateInput", "src/input.ts");
      const validateB = fn("validateOutput", "src/output.ts");
      const saveA = fn("saveUser", "src/user.ts");
      const saveB = fn("saveOrder", "src/order.ts");

      await writer.addNodes([validateA, validateB, saveA, saveB]);
      // No edges — no paths between any combination
      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { from: { query: "validate" }, to: { query: "save" } },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("No paths found between matching symbols");
    });

    it("resolves from.query to symbol via search (single match)", async () => {
      const writer = createSqliteWriter(db);
      const nodeA = fn("handleUserRequest");
      const nodeB = fn("saveToDatabase");

      await writer.addNodes([nodeA, nodeB]);
      await writer.addEdges([calls(nodeA.id, nodeB.id)]);
      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { from: { query: "handle User" } },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("handleUserRequest");
      expect(toMcp(result)).toContain("saveToDatabase");
    });

    it("resolves to.query to symbol via search (single match)", async () => {
      const writer = createSqliteWriter(db);
      const nodeA = fn("handleRequest");
      const nodeB = fn("validateUserInput");

      await writer.addNodes([nodeA, nodeB]);
      await writer.addEdges([calls(nodeA.id, nodeB.id)]);
      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { to: { query: "validate User" } },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("handleRequest");
      expect(toMcp(result)).toContain("validateUserInput");
    });
  });

  describe("query endpoint resolution relevance", () => {
    let searchIndex: SearchIndexWrapper;

    beforeEach(async () => {
      searchIndex = await createSearchIndex({ vectorDimensions });
    });

    it("falls back to semantic search for forward traversal when no exact match", async () => {
      const writer = createSqliteWriter(db);
      // "createWriter" partially matches "writer" from query
      const weakMatch = fn("createWriter");
      const targetNode = fn("doSomething");

      await writer.addNodes([weakMatch, targetNode]);
      await writer.addEdges([calls(weakMatch.id, targetNode.id)]);
      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      // Query for "sqlite writer" - falls back to semantic search
      // which finds "createWriter" as the best available match
      const result = await searchGraph(
        db,
        { from: { query: "sqlite writer" } },
        { searchIndex, embeddingProvider },
      );

      // Now falls back to semantic search result instead of failing
      expect(toMcp(result)).toContain("createWriter --CALLS--> doSomething");
    });

    it("falls back to semantic search for backward traversal when no exact match", async () => {
      const writer = createSqliteWriter(db);
      // "sourceMap" splits to "source Map sourceMap" - contains "source"
      const weakMatch = fn("sourceMap");
      const caller = fn("processFiles");

      await writer.addNodes([weakMatch, caller]);
      await writer.addEdges([calls(caller.id, weakMatch.id)]);
      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      // Query "Edge source property" - falls back to semantic search
      // which finds "sourceMap" as the best available match
      const result = await searchGraph(
        db,
        { to: { query: "Edge source property" } },
        { searchIndex, embeddingProvider },
      );

      // Now falls back to semantic search result instead of failing
      expect(toMcp(result)).toContain("processFiles --CALLS--> sourceMap");
    });

    it("prefers exact symbol match over partial token match", async () => {
      const writer = createSqliteWriter(db);
      // Both match "index" token, but "indexProject" is exact match to query
      const exactMatch = fn("indexProject");
      const partialMatch = fn("reindexFiles"); // Contains "index" via "reindex"
      const dependency = fn("writeToDb");

      await writer.addNodes([exactMatch, partialMatch, dependency]);
      await writer.addEdges([
        calls(exactMatch.id, dependency.id),
        calls(partialMatch.id, dependency.id),
      ]);
      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      const result = await searchGraph(
        db,
        { from: { query: "indexProject" } },
        { searchIndex, embeddingProvider },
      );

      // Should use exact match "indexProject", not partial match "reindexFiles"
      expect(toMcp(result)).toContain("indexProject");
      expect(toMcp(result)).toContain("indexProject --CALLS--> writeToDb");
    });

    it("falls back to semantic search when query terms partially match", async () => {
      const writer = createSqliteWriter(db);
      // "handleRequest" partially matches "handle" from query
      const weakMatch = fn("handleRequest");
      const target = fn("saveData");

      await writer.addNodes([weakMatch, target]);
      await writer.addEdges([calls(weakMatch.id, target.id)]);
      await populateSearchIndex({
        db,
        searchIndex,
        embeddingCache,
        embeddingProvider,
      });

      // Query has 3 terms: "handle", "sqlite", "connection"
      // "handleRequest" only matches 1 of 3, but it's the best available
      const result = await searchGraph(
        db,
        { from: { query: "handle sqlite connection" } },
        { searchIndex, embeddingProvider },
      );

      // Falls back to semantic search, finding "handleRequest" as best match
      expect(toMcp(result)).toContain("handleRequest --CALLS--> saveData");
    });
  });

  describe("hybrid search (with embedding provider)", () => {
    let searchIndex: SearchIndexWrapper;

    beforeEach(async () => {
      searchIndex = await createSearchIndex({ vectorDimensions });
    });

    it("uses hybrid search for from.query resolution", async () => {
      const embeddingProvider = createFakeEmbeddingProvider({
        dimensions: vectorDimensions,
      });
      const writer = createSqliteWriter(db);
      const nodeA = fn("processUserData");
      const nodeB = fn("saveToStorage");

      await writer.addNodes([nodeA, nodeB]);
      await writer.addEdges([calls(nodeA.id, nodeB.id)]);

      const docs: SearchDocument[] = [
        {
          id: nodeA.id,
          symbol: nodeA.name,
          file: nodeA.filePath,
          nodeType: "Function",
          content: "process user data and transform",
          embedding: await embeddingProvider.embedDocument(
            "process user data and transform",
          ),
        },
        {
          id: nodeB.id,
          symbol: nodeB.name,
          file: nodeB.filePath,
          nodeType: "Function",
          content: "save data to storage layer",
          embedding: await embeddingProvider.embedDocument(
            "save data to storage layer",
          ),
        },
      ];
      await searchIndex.addBatch(docs);

      const result = await searchGraph(
        db,
        { from: { query: "data processing" } },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("processUserData");
      expect(toMcp(result)).toContain("saveToStorage");
    });
  });
});
