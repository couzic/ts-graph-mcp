# Configuration

ts-graph-mcp uses a configuration file to define which TypeScript packages to index.

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
import { defineConfig } from 'ts-graph-mcp';

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
import { defineConfig } from 'ts-graph-mcp';

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
import { defineConfig } from 'ts-graph-mcp';

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
    include: ["src/**/*.ts", "lib/**/*.ts"],
    exclude: ["**/*.test.ts", "**/*.spec.ts"],
    debounce: 500  // ms
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
| `watch.include` | string[] | No | Glob patterns to include |
| `watch.exclude` | string[] | No | Glob patterns to exclude |
| `watch.debounce` | number | No | Debounce delay in milliseconds |
