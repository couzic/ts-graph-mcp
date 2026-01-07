# Config Module

Configuration loading and validation for ts-graph projects. Uses Zod schemas to validate project structure, storage backends, and watch mode settings.

## Key Exports

### Config.schemas.ts

**Zod Schemas:**
- `ProjectConfigSchema` - Schema for project configuration
- `PackageConfigSchema` - Schema for a package (name + tsconfig path)
- `StorageConfigSchema` - Discriminated union for storage backends (sqlite | memgraph)
- `WatchConfigSchema` - Schema for file watch configuration

**Type Exports:**
- `ProjectConfig` - TypeScript type for project configuration
- `PackageConfig` - TypeScript type for package configuration

**Utilities:**
- `defineConfig(config)` - Type-safe helper with validation

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

**Cache location:** `.ts-graph-mcp/` in project root. Users should add this to `.gitignore`.

## Config File Structure

```typescript
{
  packages: [
    { name: "core", tsconfig: "./tsconfig.json" },
    { name: "utils", tsconfig: "./packages/utils/tsconfig.json" }
  ],
  storage?: {
    type: "sqlite",
    path: "..."  // optional, defaults to .ts-graph-mcp/graph.db
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

TypeScript/JavaScript config files are not supported because Node.js cannot dynamically import `.ts` files at runtime without a loader (tsx/ts-node), which would break when users run the compiled package via `npx ts-graph`.

### Usage Pattern

```json
{
  "packages": [
    { "name": "core", "tsconfig": "./tsconfig.json" },
    { "name": "api", "tsconfig": "./packages/api/tsconfig.json" }
  ]
}
```

```typescript
// In application code
import { loadConfigFromDirectory } from '../config/configLoader.utils.js';
const config = loadConfigFromDirectory(process.cwd());
```

## Module Dependencies

- Used by: `src/ingestion/indexProject.ts` (for indexProject), `src/mcp/main.ts` (for server initialization)
- Depends on: zod (runtime validation), node:fs, node:path
