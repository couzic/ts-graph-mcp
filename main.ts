#!/usr/bin/env node

/**
 * ts-graph entry point
 *
 * Usage:
 *   npx ts-graph           # Start HTTP server
 *   npx ts-graph --mcp     # Start MCP stdio wrapper
 *   npx ts-graph --reindex # Force clean reindexing of project
 */

const args = process.argv.slice(2);

const isMcpMode = args.includes("--mcp");

if (isMcpMode) {
  // MCP stdio wrapper mode
  import("./mcp/src/wrapper.js").then(({ startMcpWrapper }) => {
    startMcpWrapper().catch((err) => {
      console.error("Failed to start MCP server:", err);
      process.exit(1);
    });
  });
} else {
  // HTTP server mode
  import("./http/src/server.js").then(({ startHttpServer }) => {
    startHttpServer(args).catch((err) => {
      console.error("Failed to start HTTP server:", err);
      process.exit(1);
    });
  });
}
