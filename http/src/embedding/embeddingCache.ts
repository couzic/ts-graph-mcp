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
  get(hash: string): Float32Array | undefined;
  /** Get multiple cached embeddings by content hashes. */
  getBatch(hashes: string[]): Map<string, Float32Array>;
  /** Store embedding for content hash. */
  set(hash: string, vector: Float32Array): void;
  /** Close the database connection. */
  close(): void;
}

/**
 * Convert Float32Array to Buffer for SQLite BLOB storage.
 */
const vectorToBuffer = (vector: Float32Array): Buffer => {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
};

/**
 * Convert Buffer from SQLite BLOB to Float32Array.
 */
const bufferToFloat32Array = (buffer: Buffer): Float32Array => {
  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
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
    get(hash: string): Float32Array | undefined {
      const row = getStmt.get(hash);
      if (!row) {
        return undefined;
      }
      return bufferToFloat32Array(row.vector);
    },

    getBatch(hashes: string[]): Map<string, Float32Array> {
      const result = new Map<string, Float32Array>();
      if (hashes.length === 0) {
        return result;
      }
      const placeholders = hashes.map(() => "?").join(",");
      const rows = db
        .prepare<string[], { hash: string; vector: Buffer }>(
          `SELECT hash, vector FROM embeddings WHERE hash IN (${placeholders})`,
        )
        .all(...hashes);
      for (const row of rows) {
        result.set(row.hash, bufferToFloat32Array(row.vector));
      }
      return result;
    },

    set(hash: string, vector: Float32Array): void {
      setStmt.run(hash, vectorToBuffer(vector));
    },

    close(): void {
      db.close();
    },
  };
};
