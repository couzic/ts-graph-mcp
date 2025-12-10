# Config Schema

**File:** `src/config/ConfigSchema.ts`

**Used by:** CLI, Code Ingestion, File Watcher

**Purpose:** Define and validate project configuration

---

## Zod Schemas & Inferred Types

```typescript
import { z } from 'zod';

// --- Schemas ---

export const PackageConfigSchema = z.object({
  /** Package name (unique within module) */
  name: z.string().min(1),
  /** Path to tsconfig.json (relative to project root) */
  tsconfig: z.string().min(1),
});

export const ModuleConfigSchema = z.object({
  /** Module name (unique within project) */
  name: z.string().min(1),
  /** Packages in this module */
  packages: z.array(PackageConfigSchema).min(1),
});

export const SqliteStorageSchema = z.object({
  type: z.literal('sqlite'),
  /** Path to database file (default: '.ts-graph-mcp/graph.db') */
  path: z.string().optional(),
});

export const MemgraphStorageSchema = z.object({
  type: z.literal('memgraph'),
  /** Memgraph host (default: 'localhost') */
  host: z.string().optional(),
  /** Memgraph port (default: 7687) */
  port: z.number().int().positive().optional(),
  /** Username (optional) */
  username: z.string().optional(),
  /** Password (optional) */
  password: z.string().optional(),
});

export const StorageConfigSchema = z.discriminatedUnion('type', [
  SqliteStorageSchema,
  MemgraphStorageSchema,
]);

export const WatchConfigSchema = z.object({
  /** Patterns to include */
  include: z.array(z.string()).optional(),
  /** Patterns to exclude */
  exclude: z.array(z.string()).optional(),
  /** Debounce delay in ms */
  debounce: z.number().int().nonnegative().optional(),
});

export const ProjectConfigSchema = z.object({
  /** Modules in the project */
  modules: z.array(ModuleConfigSchema).min(1),
  /** Storage configuration (default: sqlite) */
  storage: StorageConfigSchema.optional(),
  /** Watch mode configuration */
  watch: WatchConfigSchema.optional(),
});

// --- Inferred Types ---

export type PackageConfig = z.infer<typeof PackageConfigSchema>;
export type ModuleConfig = z.infer<typeof ModuleConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type WatchConfig = z.infer<typeof WatchConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
```

---

## Helper Function

```typescript
/**
 * Type-safe config helper for ts-graph-mcp.config.ts files.
 * Validates config at runtime using Zod.
 *
 * @param config - Project configuration
 * @returns Validated configuration
 * @throws ZodError if validation fails
 */
export function defineConfig(config: ProjectConfig): ProjectConfig {
  return ProjectConfigSchema.parse(config);
}
```

---

## Example Config File

**File:** `ts-graph-mcp.config.ts`

```typescript
import { defineConfig } from 'ts-graph-mcp';

export default defineConfig({
  modules: [
    {
      name: 'api',
      packages: [
        { name: 'rest', tsconfig: './packages/api/rest/tsconfig.json' },
        { name: 'graphql', tsconfig: './packages/api/graphql/tsconfig.json' },
      ],
    },
    {
      name: 'core',
      packages: [
        { name: 'domain', tsconfig: './packages/core/domain/tsconfig.json' },
        { name: 'utils', tsconfig: './packages/core/utils/tsconfig.json' },
      ],
    },
  ],
  storage: {
    type: 'sqlite',
    path: '.ts-graph-mcp/graph.db',
  },
  watch: {
    include: ['**/*.ts', '**/*.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    debounce: 100,
  },
});
```

---

## Defaults

| Setting | Default Value |
|---------|---------------|
| `storage.type` | `'sqlite'` |
| `storage.path` (sqlite) | `'.ts-graph-mcp/graph.db'` |
| `storage.host` (memgraph) | `'localhost'` |
| `storage.port` (memgraph) | `7687` |
| `watch.include` | `['**/*.ts', '**/*.tsx']` |
| `watch.exclude` | `['**/node_modules/**', '**/dist/**']` |
| `watch.debounce` | `100` |
