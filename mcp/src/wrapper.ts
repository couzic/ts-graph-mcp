import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Read version from package.json.
 */
const getVersion = (): string => {
  const packageJsonPath = join(__dirname, "../../package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  return packageJson.version;
};

/**
 * Load port from config file.
 * Uses dynamic import to avoid bundling issues.
 */
const loadPort = async (): Promise<number> => {
  const { loadConfigOrDetect } = await import(
    "../../http/src/config/configLoader.utils.js"
  );
  const configResult = loadConfigOrDetect(process.cwd());
  const port = configResult?.config.server?.port;
  if (!port) {
    throw new Error(
      "No port configured. Add server.port to ts-graph-mcp.config.json",
    );
  }
  return port;
};

/**
 * Make HTTP POST request to the server.
 */
const httpPostRequest = async (
  port: number,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; text: string }> => {
  try {
    const response = await fetch(`http://localhost:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { ok: response.ok, text };
  } catch {
    return {
      ok: false,
      text: `Error: ts-graph server not running. Start it with: npx ts-graph-mcp`,
    };
  }
};

/**
 * MCP stdio wrapper that proxies tool calls to the HTTP server.
 *
 * The HTTP server must be running separately.
 * If not running, tool calls return a clear error message.
 *
 * @example
 * ```bash
 * npx ts-graph --mcp
 * ```
 */
export const startMcpWrapper = async () => {
  console.error("MCP wrapper starting...");

  const port = await loadPort();
  console.error(`[ts-graph] Using port ${port}`);

  const server = new McpServer({
    name: "ts-graph-mcp",
    version: getVersion(),
  });

  // Register searchGraph tool (unified semantic + graph search)
  server.registerTool(
    "searchGraph",
    {
      description: `Search the code graph by concept or symbol. Returns a subgraph showing how code connects.

TRIGGERS: "analyze behavior", "trace calls", "what does X call", "who calls X", "debug", "bug", "call chain", "execution flow"

When to use:
- Analyzing function behavior or tracing execution flow
- Understanding what a function does by examining its call chain
- Investigating bugs that span multiple files
- Finding all callers of a function

IMPORTANT: Use this tool FIRST before reading files to trace dependencies. When you see an import and think "I need to read that file to trace the call chain" — use this tool instead. One query shows the entire chain with code snippets.

Parameters:
- topic: Filter to focus on relevant nodes
- from: Start node(s) - what does this depend on?
- to: End node(s) - what depends on this?

Examples:
- { from: { symbol: "handleRequest" } } → what does handleRequest call?
- { to: { symbol: "saveUser" } } → who calls saveUser?
- { from: { symbol: "A" }, to: { symbol: "B" } } → how does A reach B?
- { from: { symbol: "A", file_path: "path/to/A.ts" } } → precise lookup (avoids disambiguation)
- { topic: "validation" } → find symbols related to validation

Edge types in output: CALLS, REFERENCES, EXTENDS, IMPLEMENTS, INCLUDES`,
      inputSchema: {
        topic: z
          .string()
          .optional()
          .describe(
            "Semantic filter (natural language, e.g., 'cart validation')",
          ),
        from: z
          .object({
            query: z
              .string()
              .optional()
              .describe(
                "Lexical + semantic search (can return multiple nodes)",
              ),
            symbol: z
              .string()
              .optional()
              .describe("Exact symbol name (single node)"),
            file_path: z
              .string()
              .optional()
              .describe("Include when known to avoid disambiguation"),
          })
          .optional()
          .describe("Start node(s) - what does this depend on?"),
        to: z
          .object({
            query: z
              .string()
              .optional()
              .describe(
                "Lexical + semantic search (can return multiple nodes)",
              ),
            symbol: z
              .string()
              .optional()
              .describe("Exact symbol name (single node)"),
            file_path: z
              .string()
              .optional()
              .describe("Include when known to avoid disambiguation"),
          })
          .optional()
          .describe("End node(s) - what depends on this?"),
        max_nodes: z
          .number()
          .optional()
          .describe("Maximum nodes in output (default: 50)"),
      },
    },
    async ({ topic, from, to, max_nodes }) => {
      const body = { topic, from, to, max_nodes, format: "mcp" };
      const result = await httpPostRequest(port, "/api/graph/search", body);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: result.text }],
          isError: true,
        };
      }

      const parsed = JSON.parse(result.text) as { result: string };
      return {
        content: [{ type: "text", text: parsed.result }],
      };
    },
  );

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[ts-graph] MCP server ready");
};
