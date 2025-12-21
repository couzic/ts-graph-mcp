# Config Module

Configuration loading and validation for ts-graph-mcp projects. Uses Zod schemas to validate project structure, storage backends, and watch mode settings.

## Key Exports

### ConfigSchema.ts

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

### ConfigLoader.ts

- `findConfigFile(directory)` - Searches for config file in order: .ts, .js, .json
- `loadConfig(configPath)` - Loads and validates config from specific file path
- `loadConfigFromDirectory(directory)` - Auto-detects and loads config from directory
- `CONFIG_FILE_NAMES` - Array of supported config filenames in precedence order

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
    path: ".ts-graph-mcp/graph.db"  // optional, defaults to this
  } | {
    type: "memgraph",
    host: "localhost",  // optional
    port: 7687,        // optional
    username?: string,
    password?: string
  },
  watch?: {
    include?: string[],    // glob patterns
    exclude?: string[],    // glob patterns
    debounce?: number      // ms
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
import { loadConfigFromDirectory } from '../config/ConfigLoader.js';
const config = await loadConfigFromDirectory(process.cwd());
// config is always in full format (with modules)
```

## Module Dependencies

- Used by: `src/ingestion/Ingestion.ts` (for indexProject), `src/mcp/StartServer.ts` (for server initialization)
- Depends on: zod (runtime validation), node:fs, node:path
