import { join } from "node:path";
import type { Database } from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../http/src/config/Config.schemas.js";
import { createSqliteWriter } from "../../http/src/db/sqlite/createSqliteWriter.js";
import {
  closeDatabase,
  openDatabase,
} from "../../http/src/db/sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "../../http/src/db/sqlite/sqliteSchema.utils.js";
import { createEmbeddingProvider } from "../../http/src/embedding/createEmbeddingProvider.js";
import type { EmbeddingProvider } from "../../http/src/embedding/EmbeddingTypes.js";
import {
  DEFAULT_PRESET,
  EMBEDDING_PRESETS,
} from "../../http/src/embedding/presets.js";
import { indexProject } from "../../http/src/ingestion/indexProject.js";
import { silentLogger } from "../../http/src/logging/SilentTsGraphLogger.js";
import { searchGraph } from "../../http/src/query/search-graph/searchGraph.js";
import { formatMcpFromResult } from "../../http/src/query/shared/formatFromResult.js";
import type { QueryResult } from "../../http/src/query/shared/QueryResult.js";
import {
  createSearchIndex,
  type SearchIndexWrapper,
} from "../../http/src/search/createSearchIndex.js";

const toMcp = (result: QueryResult): string => formatMcpFromResult(result);

/**
 * E2E tests for search recall in clean-architecture sample project.
 *
 * Tests both lexical (BM25) and semantic (hybrid with embeddings) search.
 * Uses real embeddings - first run will download the model.
 */
describe("search recall E2E tests", () => {
  let db: Database;
  let projectRoot: string;
  let searchIndex: SearchIndexWrapper;
  let embeddingProvider: EmbeddingProvider;

  const VECTOR_DIMS = EMBEDDING_PRESETS[DEFAULT_PRESET].dimensions;

  beforeAll(async () => {
    projectRoot = import.meta.dirname;
    const repoRoot = join(import.meta.dirname, "..", "..");

    // Create search index and embedding provider FIRST
    searchIndex = await createSearchIndex({ vectorDimensions: VECTOR_DIMS });
    embeddingProvider = await createEmbeddingProvider({
      modelsDir: join(repoRoot, ".ts-graph-mcp", "models"),
    });

    // Database setup
    db = openDatabase({ path: ":memory:" });
    initializeSchema(db);

    // Index project with search index - embeddings generated from full source snippets
    const config: ProjectConfig = {
      packages: [{ name: "main", tsconfig: "tsconfig.json" }],
    };
    const writer = createSqliteWriter(db);
    await indexProject(config, writer, {
      projectRoot,
      logger: silentLogger,
      searchIndex,
      embeddingProvider,
    });
  }, 120_000); // 2 minute timeout for model download

  afterAll(() => {
    closeDatabase(db);
    // Don't await dispose - node-llama-cpp cleanup can be slow
    void embeddingProvider.dispose();
  });

  describe("lexical recall (BM25)", () => {
    it("finds symbols with exact token match", async () => {
      const result = await searchGraph(
        db,
        { topic: "provider" },
        { searchIndex, embeddingProvider },
      );

      // Exact token match: "Provider" in symbol name
      expect(toMcp(result)).toContain("ProviderService");
      expect(toMcp(result)).toContain("ProviderRepository");
      expect(toMcp(result)).toContain("ProviderController");
    });

    it("returns graph format with connected symbols", async () => {
      const result = await searchGraph(
        db,
        { topic: "provider" },
        { searchIndex, embeddingProvider },
      );

      // With graph format, connected symbols are included
      // Provider-related symbols call each other, so graph shows edges
      expect(toMcp(result)).toContain("## Graph");
      expect(toMcp(result)).toContain("CALLS");
    });

    it("finds plural form with plural query", async () => {
      const result = await searchGraph(
        db,
        { topic: "providers" },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("ManageProvidersCommand");
    });

    it("finds symbols by camelCase split word", async () => {
      const result = await searchGraph(
        db,
        { topic: "default" },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("setAsDefault");
      expect(toMcp(result)).toContain("SetDefaultProviderCommand");
    });

    it("finds all audit-related symbols", async () => {
      const result = await searchGraph(
        db,
        { topic: "audit" },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("AuditService");
      expect(toMcp(result)).toContain("AuditRepository");
    });

    it("finds methods by exact name", async () => {
      const result = await searchGraph(
        db,
        { topic: "enable" },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("enable");
    });

    it("finds controller symbols", async () => {
      const result = await searchGraph(
        db,
        { topic: "controller" },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("AdminController");
      expect(toMcp(result)).toContain("ProviderController");
    });

    it("finds bridge nodes connecting topic-matched seeds", async () => {
      const result = await searchGraph(
        db,
        { topic: "controller" },
        { searchIndex, embeddingProvider },
      );

      const output = toMcp(result);
      // Both controllers call SetDefaultProviderCommand.execute,
      // which doesn't match "controller" but bridges the two seeds
      expect(output).toContain("## Graph");
      expect(output).toContain("SetDefaultProviderCommand");
    });
  });

  describe("semantic recall (hybrid with embeddings)", () => {
    it("finds enable/disable via synonym 'activate'", async () => {
      const result = await searchGraph(
        db,
        { topic: "activate" },
        { searchIndex, embeddingProvider },
      );

      // Semantic search should find "enable" even without exact word match
      expect(toMcp(result)).toContain("enable");
    });

    it("finds audit via concept 'logging'", async () => {
      const result = await searchGraph(
        db,
        { topic: "logging" },
        { searchIndex, embeddingProvider },
      );

      // Semantic search should associate "logging" with "audit"
      expect(toMcp(result)).toContain("AuditService");
    });

    it.skip("finds config via concept 'settings' (nomic cosine too low)", async () => {
      const result = await searchGraph(
        db,
        { topic: "settings" },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toContain("ConfigService");
    });

    it.skip("finds repository via concept 'data access layer' (nomic cosine too low)", async () => {
      const result = await searchGraph(
        db,
        { topic: "data access layer" },
        { searchIndex, embeddingProvider },
      );

      // Semantic search: "data access layer" doesn't appear in code but relates to repositories
      expect(toMcp(result)).toMatch(/Repository/);
    });

    it.skip("finds commands via concept 'action' (nomic cosine too low)", async () => {
      const result = await searchGraph(
        db,
        { topic: "user action command" },
        { searchIndex, embeddingProvider },
      );

      expect(toMcp(result)).toMatch(/Command/);
    });
  });

  describe("topic as semantic filter", () => {
    it("filters traversal results by topic relevance", async () => {
      // Without topic filter: SetDefaultProviderCommand depends on many symbols
      const unfilteredResult = await searchGraph(
        db,
        { from: { symbol: "SetDefaultProviderCommand" } },
        { searchIndex, embeddingProvider },
      );

      // Verify unfiltered result includes both audit and non-audit symbols
      expect(toMcp(unfilteredResult)).toContain("AuditService");
      expect(toMcp(unfilteredResult)).toContain("ProviderRepository");
      expect(toMcp(unfilteredResult)).toContain("ConfigService");

      // With topic filter: only audit-related symbols should appear
      const filteredResult = await searchGraph(
        db,
        { topic: "audit", from: { symbol: "SetDefaultProviderCommand" } },
        { searchIndex, embeddingProvider },
      );

      // Should find audit-related symbols
      expect(toMcp(filteredResult)).toContain("AuditService");
      expect(toMcp(filteredResult)).toContain("AuditRepository");

      // Should NOT include provider/config symbols (not audit-related)
      expect(toMcp(filteredResult)).not.toContain("ProviderRepository");
      expect(toMcp(filteredResult)).not.toContain("ConfigService");
    });

    it("filters backward traversal by topic", async () => {
      // Who depends on AuditRepository.save, filtered by "logging" topic?
      // Note: Must use method name since class fallback for dependents isn't implemented
      const result = await searchGraph(
        db,
        { topic: "logging", to: { symbol: "AuditRepository.save" } },
        { searchIndex, embeddingProvider },
      );

      // Should find AuditService (semantically related to logging)
      expect(toMcp(result)).toContain("AuditService");
    });

    it.skip("filters path finding by topic", async () => {
      // TODO: Topic filtering for paths not yet implemented
      // Find path from AdminController to AuditRepository, filtered by "audit"
      const result = await searchGraph(
        db,
        {
          topic: "audit",
          from: { symbol: "AdminController" },
          to: { symbol: "AuditRepository" },
        },
        { searchIndex, embeddingProvider },
      );

      // Path should go through audit-related nodes
      expect(toMcp(result)).toContain("AuditService");
    });
  });

  describe("query endpoint resolution", () => {
    it("resolves from.query to traverse dependencies", async () => {
      const result = await searchGraph(
        db,
        { from: { query: "SetDefaultProviderCommand" } },
        { searchIndex, embeddingProvider },
      );

      // Should resolve to the command and find its dependencies
      expect(toMcp(result)).toContain("SetDefaultProviderCommand");
      expect(toMcp(result)).toContain("ProviderService");
    });

    it("resolves to.query to find dependents", async () => {
      const result = await searchGraph(
        db,
        { to: { query: "ProviderService" } },
        { searchIndex, embeddingProvider },
      );

      // Should find callers of ProviderService
      expect(toMcp(result)).toContain("ProviderService");
    });
  });
});
