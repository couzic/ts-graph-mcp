import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { DbWriter } from "../db/DbWriter.js";
import type { Node } from "../db/Types.js";
import type { EmbeddingProvider } from "../embedding/EmbeddingTypes.js";
import type { EmbeddingCacheConnection } from "../embedding/embeddingCache.js";
import { embedWithFallback } from "../embedding/embedWithFallback.js";
import type { SearchIndexWrapper } from "../search/createSearchIndex.js";
import type { SearchDocument } from "../search/SearchTypes.js";
import { parseFeatureFile } from "./extract/specs/parseFeatureFile.js";

interface IndexFeatureFilesResult {
  specIdMap: Map<string, string>;
  nodesAdded: number;
  edgesAdded: number;
  filesProcessed: number;
}

/**
 * Scan `specs/` directory for *.feature.md files, parse them, write Feature/Spec
 * nodes and CONTAINS edges to DB, and return a specIdMap for @spec resolution.
 *
 * @example
 * const result = await indexFeatureFiles(projectRoot, writer, options);
 * // result.specIdMap -> Map<"tool::forward-traversal", "specs/tool.feature.md:tool::forward-traversal">
 */
export const indexFeatureFiles = async (
  projectRoot: string,
  writer: DbWriter,
  options: {
    searchIndex?: SearchIndexWrapper;
    embeddingProvider: EmbeddingProvider;
    embeddingCache?: EmbeddingCacheConnection;
  },
): Promise<IndexFeatureFilesResult> => {
  const specsDir = join(projectRoot, "specs");
  if (!existsSync(specsDir)) {
    return {
      specIdMap: new Map(),
      nodesAdded: 0,
      edgesAdded: 0,
      filesProcessed: 0,
    };
  }
  const featureFilePaths = findFeatureFiles(specsDir);
  const specIdMap = new Map<string, string>();
  let nodesAdded = 0;
  let edgesAdded = 0;

  for (const absolutePath of featureFilePaths) {
    const relativePath = relative(projectRoot, absolutePath);
    const result = await reindexFeatureFile(
      absolutePath,
      relativePath,
      writer,
      options,
    );
    nodesAdded += result.nodesAdded;
    edgesAdded += result.edgesAdded;
    for (const [key, value] of result.specEntries) {
      specIdMap.set(key, value);
    }
  }

  return {
    specIdMap,
    nodesAdded,
    edgesAdded,
    filesProcessed: featureFilePaths.length,
  };
};

/**
 * Reindex a single feature file: parse, enrich nodes, write to DB and search index.
 *
 * @spec traceability::search-indexing
 */
export const reindexFeatureFile = async (
  absolutePath: string,
  relativePath: string,
  writer: DbWriter,
  options: {
    searchIndex?: SearchIndexWrapper;
    embeddingProvider: EmbeddingProvider;
    embeddingCache?: EmbeddingCacheConnection;
  },
): Promise<{
  nodesAdded: number;
  edgesAdded: number;
  specEntries: Array<[string, string]>;
}> => {
  const content = readFileSync(absolutePath, "utf-8");
  const parsed = parseFeatureFile(content, relativePath);

  if (parsed.features.length === 0) {
    return { nodesAdded: 0, edgesAdded: 0, specEntries: [] };
  }

  const specEntries: Array<[string, string]> = parsed.specs.map((spec) => [
    spec.name,
    spec.id,
  ]);

  // Enrich nodes with snippet + contentHash
  const allExtracted = [...parsed.features, ...parsed.specs];
  const lines = content.split("\n");

  const nodes: Node[] = [];
  for (const extracted of allExtracted) {
    const snippet = lines
      .slice(extracted.startLine - 1, extracted.endLine)
      .join("\n");

    const embedResult = await embedWithFallback(
      extracted.type,
      extracted.name,
      extracted.filePath,
      snippet,
      options.embeddingProvider,
      options.embeddingCache,
    );

    nodes.push({
      ...extracted,
      snippet,
      contentHash: embedResult.contentHash,
    });

    // Add to search index
    if (options.searchIndex) {
      const searchDoc: SearchDocument = {
        id: extracted.id,
        symbol: extracted.name,
        file: extracted.filePath,
        nodeType: extracted.type,
        content: snippet,
        embedding: embedResult.embedding,
      };
      await options.searchIndex.addBatch([searchDoc]);
    }
  }

  if (nodes.length > 0) {
    await writer.addNodes(nodes);
  }

  if (parsed.edges.length > 0) {
    await writer.addEdges(parsed.edges);
  }

  return {
    nodesAdded: nodes.length,
    edgesAdded: parsed.edges.length,
    specEntries,
  };
};

/**
 * Build a specIdMap from all feature files in the specs/ directory.
 * Parses all *.feature.md files but does not write to DB.
 *
 * @example
 * const specIdMap = buildSpecIdMap("/path/to/project");
 */
export const buildSpecIdMap = (projectRoot: string): Map<string, string> => {
  const specsDir = join(projectRoot, "specs");
  if (!existsSync(specsDir)) {
    return new Map();
  }
  const specIdMap = new Map<string, string>();
  for (const absolutePath of findFeatureFiles(specsDir)) {
    const relativePath = relative(projectRoot, absolutePath);
    const content = readFileSync(absolutePath, "utf-8");
    const parsed = parseFeatureFile(content, relativePath);
    for (const spec of parsed.specs) {
      specIdMap.set(spec.name, spec.id);
    }
  }
  return specIdMap;
};

/**
 * Update the specIdMap for a single feature file: remove old entries for that file,
 * then add new entries.
 *
 * @example
 * updateSpecIdMapForFile(specIdMap, "specs/auth.feature.md", [["auth::login", "specs/auth.feature.md:Spec:auth::login"]]);
 */
export const updateSpecIdMapForFile = (
  specIdMap: Map<string, string>,
  relativePath: string,
  newEntries: Array<[string, string]>,
): void => {
  const prefix = relativePath + ":";
  for (const [key, value] of specIdMap) {
    if (value.startsWith(prefix)) {
      specIdMap.delete(key);
    }
  }
  for (const [key, value] of newEntries) {
    specIdMap.set(key, value);
  }
};

/**
 * Recursively find all *.feature.md files under a directory.
 */
export const findFeatureFiles = (dir: string): string[] => {
  const results: string[] = [];

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...findFeatureFiles(fullPath));
    } else if (entry.endsWith(".feature.md")) {
      results.push(fullPath);
    }
  }

  return results;
};
