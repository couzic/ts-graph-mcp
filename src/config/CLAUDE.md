# Config Module

Configuration loading and validation for ts-graph-mcp projects. Uses Zod schemas to validate project structure, storage backends, and watch mode settings.

## Key Exports

### Config.schemas.ts

**Zod Schemas:**
- `ProjectConfigInputSchema` - Input schema accepting both full and flat formats
- `ProjectConfigSchema` - Output schema (always full format with modules)
- `ModuleConfigSchema` - Schema for a module (contains one or more packages)
- `PackageConfigSchema` - Schema for a package (name + tsconfig path)
- `StorageConfigSchema` - Discriminated union for storage backends (sqlite | memgraph)
- `WatchConfigSchema` - Schema for file watch configuration

**Type Exports:**
- `ProjectConfig` - TypeScript type for full format (output)
- `ProjectConfigInput` - TypeScript type for input (full or flat format)

**Utilities:**
- `defineConfig(config)` - Type-safe helper accepting both formats, always returns full format
- `normalizeConfig(input)` - Converts flat format to full format (creates implicit "main" module)

### configLoader.utils.ts

- `findConfigFile(directory)` - Searches for config file in order: .ts, .js, .json
- `loadConfig(configPath)` - Loads and validates config from specific file path
- `loadConfigFromDirectory(directory)` - Auto-detects and loads config from directory
- `CONFIG_FILE_NAMES` - Array of supported config filenames in precedence order

### getCacheDir.ts

- `getCacheDir(projectRoot)` - Returns cache directory path (creates if needed)
- `getDefaultDbPath(projectRoot)` - Returns default database path

**Cache location strategy:**
1. **Primary**: `node_modules/.cache/ts-graph-mcp/` (de facto standard, already gitignored)
2. **Fallback**: `.ts-graph/` in project root (for non-npm projects)

Uses `find-cache-dir` package which searches upward from `projectRoot` for `package.json`.

## Config File Structure

**Two formats are supported:**

### Flat Format (simpler, for non-monorepo projects)

```typescript
{
  packages: [
    { name: "core", tsconfig: "./tsconfig.json" },
    { name: "utils", tsconfig: "./packages/utils/tsconfig.json" }
  ],
  storage?: { ... },
  watch?: { ... }
}
```

Creates an implicit "main" module containing all packages.

### Full Format (for monorepos with multiple modules)

```typescript
{
  modules: [
    {
      name: "core",
      packages: [
        { name: "main", tsconfig: "./tsconfig.json" }
      ]
    }
  ],
  storage?: {
    type: "sqlite",
    path: "..."  // optional, defaults to node_modules/.cache/ts-graph-mcp/graph.db
  } | {
    type: "memgraph",
    host: "localhost",  // optional
    port: 7687,        // optional
    username?: string,
    password?: string
  },
  watch?: {
    debounce?: number,        // ms (default: 300)
    usePolling?: boolean,     // for Docker/WSL2/NFS
    pollingInterval?: number, // ms (default: 1000)
    silent?: boolean          // suppress reindex logs
  }
}
```

## Critical Information

### Validation is Mandatory

All config loading functions validate against Zod schemas and throw on invalid data. Never bypass validation.

### Config File Precedence

1. `ts-graph-mcp.config.ts` (preferred for type safety)
2. `ts-graph-mcp.config.js`
3. `ts-graph-mcp.config.json`

### TypeScript/JavaScript Config Files

TS/JS configs must export config as default export or named export. The loader uses dynamic import and looks for `module.default ?? module`.

### Usage Pattern

```typescript
// Flat format - for simple projects
import { defineConfig } from 'ts-graph-mcp';

export default defineConfig({
  packages: [
    { name: "core", tsconfig: "./tsconfig.json" }
  ]
});

// Full format - for monorepos
export default defineConfig({
  modules: [
    { name: "api", packages: [{ name: "rest", tsconfig: "./packages/api/tsconfig.json" }] },
    { name: "core", packages: [{ name: "domain", tsconfig: "./packages/core/tsconfig.json" }] }
  ]
});

// In application code
import { loadConfigFromDirectory } from '../config/configLoader.utils.js';
const config = await loadConfigFromDirectory(process.cwd());
// config is always in full format (with modules)
```

## Module Dependencies

- Used by: `src/ingestion/indexProject.ts` (for indexProject), `src/mcp/main.ts` (for server initialization)
- Depends on: zod (runtime validation), find-cache-dir (cache location), node:fs, node:path
