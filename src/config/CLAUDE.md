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

**Pure functions (unit tested):**
- `parseConfig(content)` - Parses and validates config JSON content
- `createDefaultConfig(tsconfig, packageName)` - Creates default ProjectConfig
- `CONFIG_FILE_NAME` - Supported config filename (`ts-graph-mcp.config.json`)

**I/O functions (not unit tested):**
- `findConfigFile(directory)` - Finds config file in directory
- `loadConfig(configPath)` - Loads and validates config from file
- `loadConfigFromDirectory(directory)` - Auto-detects and loads config
- `readPackageName(directory)` - Reads package name from package.json
- `detectTsconfig(directory)` - Checks if tsconfig.json exists

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
    polling?: boolean,     // for Docker/WSL2/NFS
    pollingInterval?: number, // ms (default: 1000)
    silent?: boolean          // suppress reindex logs
  }
}
```

## Critical Information

### Validation is Mandatory

All config loading functions validate against Zod schemas and throw on invalid data. Never bypass validation.

### Config File

Only JSON is supported: `ts-graph-mcp.config.json`

TypeScript/JavaScript config files are not supported because Node.js cannot dynamically import `.ts` files at runtime without a loader (tsx/ts-node), which would break when users run the compiled package via `npx ts-graph-mcp`.

### Usage Pattern

```json
// Flat format - for simple projects
{
  "packages": [
    { "name": "core", "tsconfig": "./tsconfig.json" }
  ]
}

// Full format - for monorepos
{
  "modules": [
    { "name": "api", "packages": [{ "name": "rest", "tsconfig": "./packages/api/tsconfig.json" }] },
    { "name": "core", "packages": [{ "name": "domain", "tsconfig": "./packages/core/tsconfig.json" }] }
  ]
}
```

```typescript
// In application code
import { loadConfigFromDirectory } from '../config/configLoader.utils.js';
const config = loadConfigFromDirectory(process.cwd());
// config is always in full format (with modules)
```

## Module Dependencies

- Used by: `src/ingestion/indexProject.ts` (for indexProject), `src/mcp/main.ts` (for server initialization)
- Depends on: zod (runtime validation), find-cache-dir (cache location), node:fs, node:path
