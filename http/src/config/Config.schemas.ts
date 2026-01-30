import { z } from "zod";

// --- Schemas ---

export const PackageConfigSchema = z.object({
  /** Package name (unique within project) */
  name: z.string().min(1),
  /** Path to tsconfig.json (relative to project root) */
  tsconfig: z.string().min(1),
});

export const SqliteStorageSchema = z.object({
  type: z.literal("sqlite"),
  /** Path to database file (default: '.ts-graph-mcp/graph.db') */
  path: z.string().optional(),
});

export const MemgraphStorageSchema = z.object({
  type: z.literal("memgraph"),
  /** Memgraph host (default: 'localhost') */
  host: z.string().optional(),
  /** Memgraph port (default: 7687) */
  port: z.number().int().positive().optional(),
  /** Username (optional) */
  username: z.string().optional(),
  /** Password (optional) */
  password: z.string().optional(),
});

export const StorageConfigSchema = z.discriminatedUnion("type", [
  SqliteStorageSchema,
  MemgraphStorageSchema,
]);

export const WatchConfigSchema = z
  .object({
    // Polling (for WSL2/Docker/NFS)
    /** Use polling instead of native fs events (required for Docker/WSL2/NFS) */
    polling: z.boolean().optional(),
    /** Polling interval in ms when polling is true (default: 1000) */
    pollingInterval: z.number().int().positive().optional(),

    // Debouncing (for fs.watch mode only)
    /** Enable debouncing of file events (default: true). Mutually exclusive with polling. */
    debounce: z.boolean().optional(),
    /** Debounce delay in ms (default: 300). Only applies when debounce is true. */
    debounceInterval: z.number().int().nonnegative().optional(),

    // Exclusions (can be read from tsconfig.json watchOptions as fallback)
    /** Directories to exclude from watching (globs supported) */
    excludeDirectories: z.array(z.string()).optional(),
    /** Files to exclude from watching (globs supported) */
    excludeFiles: z.array(z.string()).optional(),

    // Misc
    /** Suppress reindex log messages (default: false) */
    silent: z.boolean().optional(),
  })
  .refine((config) => !(config.polling === true && config.debounce === true), {
    message:
      "polling and debounce are mutually exclusive. Polling mode has built-in batching; debounce is for fs.watch mode only.",
    path: ["debounce"],
  });

export const ServerConfigSchema = z.object({
  /** HTTP server port (default: finds available port) */
  port: z.number().int().positive().optional(),
  /** Bind address (default: '127.0.0.1' for security) */
  host: z.string().optional(),
});

export const EmbeddingConfigSchema = z.object({
  /** Embedding model preset (default: 'nomic-embed') */
  preset: z.enum(["qwen3-0.6b", "qwen3-4b", "jina-code", "nomic-embed"]).optional(),
  /** Or explicit model configuration: */
  /** Hugging Face repo path */
  repo: z.string().optional(),
  /** GGUF filename */
  filename: z.string().optional(),
  /** Query prefix for search queries */
  queryPrefix: z.string().optional(),
  /** Document prefix for indexing */
  documentPrefix: z.string().optional(),
});

/** Project configuration schema */
export const ProjectConfigSchema = z.object({
  /** Packages in the project */
  packages: z.array(PackageConfigSchema).min(1),
  /** Storage configuration (default: sqlite) */
  storage: StorageConfigSchema.optional(),
  /** Watch mode configuration */
  watch: WatchConfigSchema.optional(),
  /** HTTP server configuration */
  server: ServerConfigSchema.optional(),
  /** Embedding configuration for semantic search */
  embedding: EmbeddingConfigSchema.optional(),
});

// --- Inferred Types ---

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type WatchConfig = z.infer<typeof WatchConfigSchema>;
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;
