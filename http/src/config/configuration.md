# Configuration

ts-graph uses a configuration file to define which TypeScript packages to index.

## Config File Location

The server looks for config files in this order:
1. `ts-graph-mcp.config.ts` (recommended)
2. `ts-graph-mcp.config.js`
3. `ts-graph-mcp.config.json`

## Examples

### Minimal Configuration

Single package project:

```typescript
// ts-graph-mcp.config.ts
import { defineConfig } from 'ts-graph';

export default defineConfig({
  modules: [
    {
      name: "app",
      packages: [
        { name: "main", tsconfig: "./tsconfig.json" }
      ]
    }
  ]
});
```

### Monorepo Configuration

Multiple packages organized by domain:

```typescript
// ts-graph-mcp.config.ts
import { defineConfig } from 'ts-graph';

export default defineConfig({
  modules: [
    {
      name: "core",
      packages: [
        { name: "domain", tsconfig: "./packages/domain/tsconfig.json" },
        { name: "utils", tsconfig: "./packages/utils/tsconfig.json" }
      ]
    },
    {
      name: "api",
      packages: [
        { name: "server", tsconfig: "./apps/api/tsconfig.json" }
      ]
    },
    {
      name: "web",
      packages: [
        { name: "frontend", tsconfig: "./apps/web/tsconfig.json" }
      ]
    }
  ]
});
```

### Full Configuration

All options with custom storage and watch settings:

```typescript
// ts-graph-mcp.config.ts
import { defineConfig } from 'ts-graph';

export default defineConfig({
  modules: [
    {
      name: "app",
      packages: [
        { name: "main", tsconfig: "./tsconfig.json" }
      ]
    }
  ],

  // Optional: customize database location (default: .ts-graph-mcp/graph.db)
  storage: {
    type: "sqlite",
    path: "./custom/path/graph.db"
  },

  // Optional: file watching configuration
  watch: {
    // Choose ONE mode: polling OR debounce (mutually exclusive)

    // Debounce mode (default, for native fs.watch)
    debounce: true,
    debounceInterval: 300,  // ms

    // Polling mode (for WSL2/Docker/NFS where fs.watch doesn't work)
    // polling: true,
    // pollingInterval: 1000,  // ms

    // Exclusions
    excludeDirectories: ["dist", "build"],
    excludeFiles: ["*.generated.ts"],

    // Misc
    silent: false
  }
});
```

### JSON Configuration

If you prefer JSON:

```json
{
  "modules": [
    {
      "name": "app",
      "packages": [
        { "name": "main", "tsconfig": "./tsconfig.json" }
      ]
    }
  ]
}
```

## Schema Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `modules` | array | Yes | List of modules to index |
| `modules[].name` | string | Yes | Unique module name |
| `modules[].packages` | array | Yes | Packages in this module |
| `modules[].packages[].name` | string | Yes | Unique package name within module |
| `modules[].packages[].tsconfig` | string | Yes | Path to tsconfig.json (relative to project root) |
| `storage` | object | No | Database configuration |
| `storage.type` | "sqlite" | No | Storage backend (only sqlite supported currently) |
| `storage.path` | string | No | Database file path (default: `.ts-graph-mcp/graph.db`) |
| `watch` | object | No | File watching configuration |
| `watch.polling` | boolean | No | Use polling instead of fs.watch (for WSL2/Docker/NFS) |
| `watch.pollingInterval` | number | No | Polling interval in ms (default: 1000) |
| `watch.debounce` | boolean | No | Enable debouncing (default: true). **Mutually exclusive with polling.** |
| `watch.debounceInterval` | number | No | Debounce delay in ms (default: 300) |
| `watch.excludeDirectories` | string[] | No | Directories to exclude (globs supported) |
| `watch.excludeFiles` | string[] | No | Files to exclude (globs supported) |
| `watch.silent` | boolean | No | Suppress reindex log messages |
