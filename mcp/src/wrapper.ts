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
 * Make HTTP request to the server.
 */
const httpRequest = async (
  port: number,
  path: string,
): Promise<{ ok: boolean; text: string }> => {
  try {
    const response = await fetch(`http://localhost:${port}${path}`);
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

  // Register dependenciesOf tool
  server.registerTool(
    "dependenciesOf",
    {
      description:
        "Find all code that a symbol depends on (forward dependencies). Answers: 'What does this call?' 'What happens when X runs?'",
      inputSchema: {
        file_path: z
          .string()
          .optional()
          .describe("File path containing the symbol (e.g., 'src/utils.ts'). Optional — omit to search across all files."),
        symbol: z
          .string()
          .describe("Symbol name (e.g., 'formatDate', 'User.save')"),
        max_nodes: z
          .number()
          .optional()
          .describe("Maximum nodes to include in output (default: 50). When exceeded, shows graph only without node details."),
      },
    },
    async ({ file_path, symbol, max_nodes }) => {
      let path = `/api/graph/dependencies?symbol=${encodeURIComponent(symbol)}`;
      if (file_path) {
        path += `&file=${encodeURIComponent(file_path)}`;
      }
      if (max_nodes !== undefined) {
        path += `&max_nodes=${max_nodes}`;
      }
      const result = await httpRequest(port, path);

      return {
        content: [{ type: "text", text: result.text }],
        isError: !result.ok,
      };
    },
  );

  // Register dependentsOf tool
  server.registerTool(
    "dependentsOf",
    {
      description:
        "Find all code that depends on a symbol (reverse dependencies). Answers: 'Who calls this?' 'What would break if I changed this?'",
      inputSchema: {
        file_path: z
          .string()
          .optional()
          .describe("File path containing the symbol (e.g., 'src/utils.ts'). Optional — omit to search across all files."),
        symbol: z
          .string()
          .describe("Symbol name (e.g., 'formatDate', 'User.save')"),
        max_nodes: z
          .number()
          .optional()
          .describe("Maximum nodes to include in output (default: 50). When exceeded, shows graph only without node details."),
      },
    },
    async ({ file_path, symbol, max_nodes }) => {
      let path = `/api/graph/dependents?symbol=${encodeURIComponent(symbol)}`;
      if (file_path) {
        path += `&file=${encodeURIComponent(file_path)}`;
      }
      if (max_nodes !== undefined) {
        path += `&max_nodes=${max_nodes}`;
      }
      const result = await httpRequest(port, path);

      return {
        content: [{ type: "text", text: result.text }],
        isError: !result.ok,
      };
    },
  );

  // Register pathsBetween tool
  server.registerTool(
    "pathsBetween",
    {
      description:
        "Find how two symbols connect through the code graph. Answers: 'How does A reach B?' 'What's the path between these symbols?'",
      inputSchema: {
        from: z.object({
          file_path: z.string().optional().describe("File path (e.g., 'src/api/handler.ts'). Optional — omit to search across all files."),
          symbol: z.string().describe("Symbol name (e.g., 'handleRequest')"),
        }),
        to: z.object({
          file_path: z.string().optional().describe("File path (e.g., 'src/db/queries.ts'). Optional — omit to search across all files."),
          symbol: z.string().describe("Symbol name (e.g., 'executeQuery')"),
        }),
        max_nodes: z
          .number()
          .optional()
          .describe("Maximum nodes to include in output (default: 50). When exceeded, shows graph only without node details."),
      },
    },
    async ({ from, to, max_nodes }) => {
      let path = `/api/graph/paths?from_symbol=${encodeURIComponent(from.symbol)}&to_symbol=${encodeURIComponent(to.symbol)}`;
      if (from.file_path) {
        path += `&from_file=${encodeURIComponent(from.file_path)}`;
      }
      if (to.file_path) {
        path += `&to_file=${encodeURIComponent(to.file_path)}`;
      }
      if (max_nodes !== undefined) {
        path += `&max_nodes=${max_nodes}`;
      }
      const result = await httpRequest(port, path);

      return {
        content: [{ type: "text", text: result.text }],
        isError: !result.ok,
      };
    },
  );

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[ts-graph] MCP server ready");
};
