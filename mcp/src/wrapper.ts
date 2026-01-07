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
      text: `Error: ts-graph server not running. Start it with: npx ts-graph`,
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
          .describe("File path containing the symbol (e.g., 'src/utils.ts')"),
        symbol: z
          .string()
          .describe("Symbol name (e.g., 'formatDate', 'User.save')"),
      },
    },
    async ({ file_path, symbol }) => {
      const path = `/api/graph/dependencies?file=${encodeURIComponent(file_path)}&symbol=${encodeURIComponent(symbol)}`;
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
          .describe("File path containing the symbol (e.g., 'src/utils.ts')"),
        symbol: z
          .string()
          .describe("Symbol name (e.g., 'formatDate', 'User.save')"),
      },
    },
    async ({ file_path, symbol }) => {
      const path = `/api/graph/dependents?file=${encodeURIComponent(file_path)}&symbol=${encodeURIComponent(symbol)}`;
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
          file_path: z.string().describe("File path (e.g., 'src/api/handler.ts')"),
          symbol: z.string().describe("Symbol name (e.g., 'handleRequest')"),
        }),
        to: z.object({
          file_path: z.string().describe("File path (e.g., 'src/db/queries.ts')"),
          symbol: z.string().describe("Symbol name (e.g., 'executeQuery')"),
        }),
      },
    },
    async ({ from, to }) => {
      const path =
        `/api/graph/paths?from_file=${encodeURIComponent(from.file_path)}&from_symbol=${encodeURIComponent(from.symbol)}` +
        `&to_file=${encodeURIComponent(to.file_path)}&to_symbol=${encodeURIComponent(to.symbol)}`;
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
