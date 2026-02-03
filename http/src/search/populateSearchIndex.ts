import type { NodeType } from "@ts-graph/shared";
import type Database from "better-sqlite3";
import type { SearchIndexWrapper } from "./createSearchIndex.js";
import type { SearchDocument } from "./SearchTypes.js";

/**
 * Load all nodes from the database into the search index.
 *
 * @example
 * const searchIndex = await createSearchIndex();
 * await populateSearchIndex(db, searchIndex);
 */
export const populateSearchIndex = async (
  db: Database.Database,
  searchIndex: SearchIndexWrapper,
): Promise<number> => {
  // Query all nodes
  const rows = db
    .prepare<[], { id: string; name: string; file_path: string; type: string }>(
      `SELECT id, name, file_path, type
       FROM nodes`,
    )
    .all();

  if (rows.length === 0) {
    return 0;
  }

  // Convert to search documents
  const docs: SearchDocument[] = rows.map((row) => ({
    id: row.id,
    symbol: row.name,
    file: row.file_path,
    nodeType: row.type as NodeType,
    content: "", // TODO: Add source snippets when available
  }));

  // Insert in batches for performance
  const batchSize = 500;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    await searchIndex.addBatch(batch);
  }

  return docs.length;
};
