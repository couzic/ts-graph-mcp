# Server

**Status:** ✅ Implemented

**ID:** `server`

## HTTP API

### Health check

> `{#server::api.health}`

`GET /health` returns a JSON response with:

- `status`: `"ok"`
- `ready`: `true`
- `indexed_files`: number of distinct files with indexed symbols

### Symbol search endpoint

> `{#server::api.symbol-search}`

`GET /api/symbols?q=<query>` returns a JSON array of matching symbols.

- Performs case-insensitive prefix matching on symbol names.
- Returns at most 50 results, ordered by name.
- Each result contains `file_path`, `symbol`, and `type`.
- Returns an empty array when `q` is missing or empty.

### Graph search endpoint

> `{#server::api.graph-search}`

`POST /api/graph/search` accepts a JSON body with optional fields `topic`,
`from`, `to`, `max_nodes`, `format`, and `direction`.

- `from` and `to` are endpoint objects with either `{ symbol, file_path? }` or
  `{ query }`.
- `topic` is a standalone semantic search string, not combinable with `from`/`to`
  (enforced at the type level via discriminated union).
- Returns `{ result: string }` where `result` is the formatted output.

### Graph search validation

> `{#server::api.graph-search-validation}`

The endpoint returns HTTP 400 when none of `topic`, `from`, or `to` are
provided in the request body.

### Graph search output formats

> `{#server::api.graph-search-formats}`

The `format` field controls the output format:

- `"mcp"` (default): text format with Graph and Nodes sections.
- `"mermaid"`: Mermaid diagram syntax. When `format` is `"mermaid"`, the
  optional `direction` field (`"LR"` or `"TD"`) controls the diagram layout.

## MCP stdio mode

### Server discovery from config

> `{#server::mcp.discovery}`

The MCP wrapper reads the HTTP server port from the config file
(`ts-graph-mcp.config.json`) in the current working directory. It uses the
`server.port` field. If no port is configured, the wrapper throws an error.

### Tool proxy

> `{#server::mcp.tool-proxy}`

The MCP wrapper exposes a single `searchGraph` tool over stdio. It proxies calls
to the HTTP server via `POST /api/graph/search` at `http://localhost:{port}`.

- The tool accepts `topic`, `from`, `to`, and `max_nodes` parameters.
- It always requests `format: "mcp"` from the HTTP server.
- On success, it returns the `result` field from the JSON response as text
  content.
- On HTTP error, it returns the response text with `isError: true`.

### MCP error when server unreachable

> `{#server::mcp.server-unreachable}`

When the HTTP server is not running, MCP tool calls return a text message
indicating the server is not running, with `isError: true`.

## CLI modes

### CLI mode dispatch

> `{#server::cli.mode-dispatch}`

The entry point (`main.ts`) dispatches based on the `--mcp` flag:

- Without `--mcp`: starts the HTTP server (imports and calls `startHttpServer`).
- With `--mcp`: starts the MCP stdio wrapper (imports and calls
  `startMcpWrapper`).

### Force reindex flag

> `{#server::cli.reindex}`

When `--reindex` is passed to the HTTP server, the database is cleared and the
entire project is re-indexed from scratch, regardless of whether a database
already exists.

## Startup sequence

### Startup sequence

> `{#server::startup.sequence}`

The HTTP server starts up in this order:

1. Load config and resolve embedding preset.
2. Create and initialize the embedding provider (downloads model if needed).
3. Create the search index.
4. Index the project (full index if no DB exists or `--reindex`, otherwise sync
   changed files from manifest).
5. Remove orphaned edges `[@server::startup.orphan-cleanup]`.
6. Start the file watcher (if a valid config exists).
7. Bind the Express server on the configured port.

The server is not ready to accept requests until step 7 completes.

### Port required

> `{#server::startup.port-required}`

The HTTP server requires `server.port` in the config file. If no port is
configured, the process exits with an error message.

### Orphaned edge cleanup

> `{#server::startup.orphan-cleanup}`

After indexing/syncing, the server removes edges whose target nodes no longer
exist in the database. The count of removed edges is logged when non-zero.

## Graceful shutdown

### SIGINT shutdown

> `{#server::shutdown.sigint}`

On SIGINT (Ctrl+C), the server:

1. Closes the file watcher.
2. Disposes the embedding provider.
3. Closes the HTTP server.
4. Closes the database connection.
5. Exits with code 0.

### SIGTERM shutdown

> `{#server::shutdown.sigterm}`

On SIGTERM, the server performs the same cleanup as SIGINT
`[@server::shutdown.sigint]` and exits with code 0.

## Web UI

### SPA served at root

> `{#server::ui.spa}`

The server serves the built UI as static files from the `public` directory
(Vite build output). Static assets (JS, CSS, images) are served directly.

### SPA fallback routing

> `{#server::ui.spa-fallback}`

Any GET request that does not match a static file or an API route is served
`index.html`, enabling client-side routing in the React SPA.
