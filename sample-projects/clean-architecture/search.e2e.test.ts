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
import {
  createSearchIndex,
  type SearchIndexWrapper,
} from "../../http/src/search/createSearchIndex.js";

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
        projectRoot,
        { topic: "provider" },
        { searchIndex },
      );

      // Exact token match: "Provider" in symbol name
      expect(result).toContain("ProviderService");
      expect(result).toContain("ProviderRepository");
      expect(result).toContain("ProviderController");
    });

    it("returns graph format with connected symbols", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "provider" },
        { searchIndex },
      );

      // With graph format, connected symbols are included
      // Provider-related symbols call each other, so graph shows edges
      expect(result).toContain("## Graph");
      expect(result).toContain("CALLS");
    });

    it("finds plural form with plural query", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "providers" },
        { searchIndex },
      );

      expect(result).toContain("ManageProvidersCommand");
    });

    it("finds symbols by camelCase split word", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "default" },
        { searchIndex },
      );

      expect(result).toContain("setAsDefault");
      expect(result).toContain("SetDefaultProviderCommand");
    });

    it("finds all audit-related symbols", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "audit" },
        { searchIndex },
      );

      expect(result).toContain("AuditService");
      expect(result).toContain("AuditRepository");
    });

    it("finds methods by exact name", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "enable" },
        { searchIndex },
      );

      expect(result).toContain("enable");
    });

    it("finds controller symbols", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "controller" },
        { searchIndex },
      );

      expect(result).toContain("AdminController");
      expect(result).toContain("ProviderController");
    });
  });

  describe("semantic recall (hybrid with embeddings)", () => {
    it("finds enable/disable via synonym 'activate'", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "activate" },
        { searchIndex, embeddingProvider },
      );

      // Semantic search should find "enable" even without exact word match
      expect(result).toContain("enable");
    });

    it("finds audit via concept 'logging'", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "logging" },
        { searchIndex, embeddingProvider },
      );

      // Semantic search should associate "logging" with "audit"
      expect(result).toContain("AuditService");
    });

    it("finds config via concept 'settings'", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "settings" },
        { searchIndex, embeddingProvider },
      );

      expect(result).toContain("ConfigService");
    });

    it("finds repository via concept 'data access layer'", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "data access layer" },
        { searchIndex, embeddingProvider },
      );

      // Semantic search: "data access layer" doesn't appear in code but relates to repositories
      expect(result).toMatch(/Repository/);
    });

    it("finds commands via concept 'action'", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "user action command" },
        { searchIndex, embeddingProvider },
      );

      expect(result).toMatch(/Command/);
    });
  });

  describe("topic as semantic filter", () => {
    it("filters traversal results by topic relevance", async () => {
      // Without topic filter: SetDefaultProviderCommand depends on many symbols
      const unfilteredResult = await searchGraph(
        db,
        projectRoot,
        { from: { symbol: "SetDefaultProviderCommand" } },
        { searchIndex, embeddingProvider },
      );

      // Verify unfiltered result includes both audit and non-audit symbols
      expect(unfilteredResult).toContain("AuditService");
      expect(unfilteredResult).toContain("ProviderRepository");
      expect(unfilteredResult).toContain("ConfigService");

      // With topic filter: only audit-related symbols should appear
      const filteredResult = await searchGraph(
        db,
        projectRoot,
        { topic: "audit", from: { symbol: "SetDefaultProviderCommand" } },
        { searchIndex, embeddingProvider },
      );

      // Should find audit-related symbols
      expect(filteredResult).toContain("AuditService");
      expect(filteredResult).toContain("AuditRepository");

      // Should NOT include provider/config symbols (not audit-related)
      expect(filteredResult).not.toContain("ProviderRepository");
      expect(filteredResult).not.toContain("ConfigService");
    });

    it("filters backward traversal by topic", async () => {
      // Who depends on AuditRepository.save, filtered by "logging" topic?
      // Note: Must use method name since class fallback for dependents isn't implemented
      const result = await searchGraph(
        db,
        projectRoot,
        { topic: "logging", to: { symbol: "AuditRepository.save" } },
        { searchIndex, embeddingProvider },
      );

      // Should find AuditService (semantically related to logging)
      expect(result).toContain("AuditService");
    });

    it.skip("filters path finding by topic", async () => {
      // TODO: Topic filtering for paths not yet implemented
      // Find path from AdminController to AuditRepository, filtered by "audit"
      const result = await searchGraph(
        db,
        projectRoot,
        {
          topic: "audit",
          from: { symbol: "AdminController" },
          to: { symbol: "AuditRepository" },
        },
        { searchIndex, embeddingProvider },
      );

      // Path should go through audit-related nodes
      expect(result).toContain("AuditService");
    });
  });

  describe("query endpoint resolution", () => {
    it("resolves from.query to traverse dependencies", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { from: { query: "SetDefaultProviderCommand" } },
        { searchIndex, embeddingProvider },
      );

      // Should resolve to the command and find its dependencies
      expect(result).toContain("SetDefaultProviderCommand");
      expect(result).toContain("ProviderService");
    });

    it("resolves to.query to find dependents", async () => {
      const result = await searchGraph(
        db,
        projectRoot,
        { to: { query: "ProviderService" } },
        { searchIndex, embeddingProvider },
      );

      // Should find callers of ProviderService
      expect(result).toContain("ProviderService");
    });
  });
});
