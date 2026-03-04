# Configuration

**Status:** ✅ Implemented

**ID:** `configuration`

## Config file

### Config file name and location

> `{#configuration::config-file}`

The config file is named `ts-graph-mcp.config.json` and is located in the
project root directory.

### JSON only

> `{#configuration::json-only}`

Only JSON format is supported. TypeScript or JavaScript config files are not
supported because Node.js cannot dynamically import `.ts` files at runtime
without a loader.

## Required fields

### packages field

> `{#configuration::packages}`

The `packages` field is an array of objects, each with `name` (string) and
`tsconfig` (string, relative path to tsconfig.json).

### Package name is non-empty

> `{#configuration::packages.name-non-empty}`

A package entry with an empty `name` string is rejected.

### Package tsconfig is non-empty

> `{#configuration::packages.tsconfig-non-empty}`

A package entry with an empty `tsconfig` string is rejected.

### At least one package required

> `{#configuration::packages.min-one}`

The `packages` array must contain at least one entry. An empty array is
rejected.

### server.port is required for the server to start

> `{#configuration::server-port-required}`

The `server` field is optional in the config schema, but both the HTTP server
and the MCP wrapper exit with an error if `server.port` is not set. The error
message directs the user to add `server.port` to `ts-graph-mcp.config.json`.

### server.host field

> `{#configuration::server-host}`

The `server.host` field is an optional string in the config schema. It is
accepted during validation but is not currently used by the HTTP server.

## Optional fields

### storage defaults to sqlite

> `{#configuration::storage.default-sqlite}`

When `storage` is omitted, SQLite is used.

### SQLite database path

> `{#configuration::storage.sqlite-path}`

When `storage.type` is `"sqlite"`, an optional `path` field specifies the
database file location. When omitted, the database is stored at
`.ts-graph-mcp/sqlite/graph.db` relative to the project root.

### Memgraph storage

> `{#configuration::storage.memgraph}`

When `storage.type` is `"memgraph"`, optional fields are `host` (string), `port`
(positive integer), `username` (string), and `password` (string).

### Invalid storage type rejected

> `{#configuration::storage.invalid-type}`

A `storage.type` value other than `"sqlite"` or `"memgraph"` is rejected.

## Watch options

### watch is optional

> `{#configuration::watch.optional}`

The `watch` field is optional. When omitted, file watching uses default
settings.

### Debounce enabled by default

> `{#configuration::watch.debounce-default}`

When `watch.debounce` is not set, debouncing defaults to `true` (applied at
runtime by the file watcher).

### Debounce interval default

> `{#configuration::watch.debounce-interval-default}`

When `watch.debounceInterval` is not set, it defaults to `300` ms (applied at
runtime by the file watcher).

### Polling mode

> `{#configuration::watch.polling}`

When `watch.polling` is `true`, the file watcher uses polling instead of native
filesystem events. Required for Docker, WSL2, and NFS environments.

### Polling interval default

> `{#configuration::watch.polling-interval-default}`

When `watch.pollingInterval` is not set, it defaults to `1000` ms (applied at
runtime by the file watcher).

### Polling and debounce are mutually exclusive

> `{#configuration::watch.polling-debounce-exclusive}`

Setting both `watch.polling: true` and `watch.debounce: true` is rejected with
an error indicating they are mutually exclusive. Polling mode has built-in
batching; debounce is for fs.watch mode only.

### Directory exclusions

> `{#configuration::watch.exclude-directories}`

`watch.excludeDirectories` is an optional array of strings (globs supported).
Directories matching these patterns are excluded from file watching.

### File exclusions

> `{#configuration::watch.exclude-files}`

`watch.excludeFiles` is an optional array of strings (globs supported). Files
matching these patterns are excluded from file watching.

### Silent mode

> `{#configuration::watch.silent}`

When `watch.silent` is `true`, reindex log messages are suppressed.

### tsconfig watchOptions fallback

> `{#configuration::watch.tsconfig-fallback}`

When no explicit watch config is provided, watch options are read from the
`watchOptions` field of `tsconfig.json`. Specifically:

- `watchFile` values containing "polling" (e.g., `fixedPollingInterval`,
  `priorityPollingInterval`, `dynamicPriorityPolling`, `fixedChunkSizePolling`)
  map to `polling: true`
- `watchFile: "useFsEvents"` does not enable polling
- `pollingInterval` maps directly
- `excludeDirectories` maps directly
- `excludeFiles` maps directly
- `watchDirectory`, `fallbackPolling`, `synchronousWatchDirectory` are ignored
- Invalid JSON in tsconfig returns empty options (no error)

### Explicit config overrides tsconfig watchOptions

> `{#configuration::watch.explicit-overrides-tsconfig}`

When both explicit watch config and tsconfig watchOptions exist, explicit values
take precedence field by field. Undefined values in explicit config do not
override tsconfig values.

## Embedding presets

### Default embedding preset

> `{#configuration::embedding.default-preset}`

When `embedding.preset` is not specified, `"nomic-embed-text-v1.5"` is used.

### Available embedding presets

> `{#configuration::embedding.presets}`

Four presets are available:

| Preset                         | Dimensions |
| ------------------------------ | ---------- |
| `nomic-embed-text-v1.5`        | 768        |
| `qwen3-0.6b`                   | 1024       |
| `qwen3-4b`                     | 2560       |
| `jina-embeddings-v2-base-code` | 768        |

Some presets define `queryPrefix` and `documentPrefix` strings that are
prepended to text before embedding.

### Explicit model configuration

> `{#configuration::embedding.explicit-model}`

Instead of (or in addition to) a preset, the embedding config accepts explicit
fields: `repo` (Hugging Face repo path), `filename` (GGUF filename),
`queryPrefix`, and `documentPrefix`. Explicit fields override preset values.

### Unknown preset rejected

> `{#configuration::embedding.unknown-preset}`

An `embedding.preset` value not in the list of available presets causes the
server to exit with an error listing the available presets.

## Auto-detection

### Auto-detection from tsconfig.json

> `{#configuration::auto-detect}`

When no `ts-graph-mcp.config.json` exists, the system looks for `tsconfig.json`
in the current directory. If found, it generates a default config with a single
package entry using `"./tsconfig.json"` as the tsconfig path.

### Auto-detection reads package name

> `{#configuration::auto-detect.package-name}`

During auto-detection, the package name is read from `package.json` in the same
directory. If `package.json` exists and has a non-empty `name` field, that name
is used.

### Auto-detection falls back to directory name

> `{#configuration::auto-detect.dir-fallback}`

If `package.json` does not exist or has no `name` field, the directory name is
used as the package name.

### No config and no tsconfig

> `{#configuration::auto-detect.none}`

When neither `ts-graph-mcp.config.json` nor `tsconfig.json` exists in the
directory, auto-detection returns null. The server logs a warning and indexes
nothing.

## Validation

### Invalid JSON rejected

> `{#configuration::validation.invalid-json}`

A config file with invalid JSON throws an error with the message
`"Failed to parse JSON config: {path}"`.

### Invalid structure rejected

> `{#configuration::validation.invalid-structure}`

A config file with valid JSON but invalid structure (e.g., missing `packages`,
empty `packages` array) is rejected by Zod schema validation.

## Storage paths

### Cache directory

> `{#configuration::cache-dir}`

All ts-graph data is stored under `.ts-graph-mcp/` in the project root. This
directory is created automatically if it does not exist.

### Models directory

> `{#configuration::models-dir}`

Embedding models are downloaded and stored in `.ts-graph-mcp/models/`.

### Embedding cache directory

> `{#configuration::embedding-cache-dir}`

Embedding vectors are cached in `.ts-graph-mcp/embedding-cache/` with one SQLite
database per model, named `{preset-name}.db`.
