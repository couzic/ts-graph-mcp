import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

/**
 * Compute SHA-256 hash of content for cache key.
 *
 * @example
 * computeContentHash("function foo() {}") // "a1b2c3..."
 */
export const computeContentHash = (content: string): string => {
  return createHash("sha256").update(content).digest("hex");
};

/**
 * Connection to an embedding cache database.
 * One SQLite database per model, stored in `.ts-graph-mcp/embedding-cache/`.
 */
export interface EmbeddingCacheConnection {
  /** Get cached embedding by content hash. Returns undefined if not found. */
  get(hash: string): number[] | undefined;
  /** Store embedding for content hash. */
  set(hash: string, vector: number[]): void;
  /** Close the database connection. */
  close(): void;
}

/**
 * Convert number array to Buffer for SQLite BLOB storage.
 */
const vectorToBuffer = (vector: number[]): Buffer => {
  const float32 = new Float32Array(vector);
  return Buffer.from(float32.buffer);
};

/**
 * Convert Buffer from SQLite BLOB to number array.
 */
const bufferToVector = (buffer: Buffer): number[] => {
  const float32 = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return Array.from(float32);
};

/**
 * Initialize the embedding cache schema.
 */
const initializeSchema = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      hash TEXT PRIMARY KEY,
      vector BLOB NOT NULL
    )
  `);
};

/**
 * Open or create an embedding cache database.
 * Creates the cache directory if it doesn't exist.
 *
 * @example
 * const cache = openEmbeddingCache(".ts-graph-mcp", "nomic-embed-text-v1.5");
 * const vector = cache.get(hash);
 * cache.set(hash, newVector);
 * cache.close();
 */
export const openEmbeddingCache = (
  cacheDir: string,
  modelName: string,
): EmbeddingCacheConnection => {
  const dir = join(cacheDir, "embedding-cache");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const dbPath = join(dir, `${modelName}.db`);
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  initializeSchema(db);

  const getStmt = db.prepare<[string], { vector: Buffer }>(
    "SELECT vector FROM embeddings WHERE hash = ?",
  );

  const setStmt = db.prepare<[string, Buffer]>(
    "INSERT OR REPLACE INTO embeddings (hash, vector) VALUES (?, ?)",
  );

  return {
    get(hash: string): number[] | undefined {
      const row = getStmt.get(hash);
      if (!row) {
        return undefined;
      }
      return bufferToVector(row.vector);
    },

    set(hash: string, vector: number[]): void {
      setStmt.run(hash, vectorToBuffer(vector));
    },

    close(): void {
      db.close();
    },
  };
};
