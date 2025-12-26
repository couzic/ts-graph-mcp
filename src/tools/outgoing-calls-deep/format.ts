import type { Node } from "../../db/Types.js";
import type { Snippet } from "../shared/extractSnippet.js";
import { TYPE_ORDER, TYPE_PLURALS } from "../shared/formatConstants.js";
import {
  formatLocation,
  formatModulePackageLines,
  formatNode,
  groupByFile,
  groupByType,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";

/**
 * A callee node with its extracted code snippets.
 */
export interface CalleeWithSnippets {
  node: Node;
  snippets: Snippet[];
}

/**
 * Options for formatting callees.
 */
export interface FormatCalleesOptions {
  /** When true, indicates snippets were omitted due to high callee count */
  snippetsOmitted?: boolean;
}

/**
 * Format callees for LLM consumption with hierarchical grouping.
 *
 * Output format:
 * ```
 * source:
 *   name: formatDate
 *   type: Function
 *   file: src/utils.ts
 *   offset: 15
 *   limit: 6
 *   module: core
 *   package: main
 *
 * callees[12]:
 *
 * src/api/handler.ts (3 callees):
 *   functions[2]:
 *     handleRequest [10-25] exp async (req:Request) → Promise<Response>
 *       offset: 10, limit: 16
 *     validateInput [30-35] (data:unknown) → boolean
 *       offset: 30, limit: 6
 *   methods[1]:
 *     ApiClient.fetch [40-50] private async (url:string) → Promise<Data>
 *       offset: 40, limit: 11
 *
 * src/services/UserService.ts (2 callees):
 *   ...
 * ```
 */
export function formatCallees(
  source: SymbolLocation,
  nodes: Node[],
  options: FormatCalleesOptions = {},
): string {
  const lines: string[] = [];

  // Header - machine-readable location for Read tool
  lines.push("source:");
  lines.push(`  name: ${source.name}`);
  lines.push(`  type: ${source.type}`);
  lines.push(`  file: ${source.file}`);
  lines.push(`  offset: ${source.offset}`);
  lines.push(`  limit: ${source.limit}`);
  lines.push(...formatModulePackageLines(source.module, source.package, "  "));
  lines.push("");

  if (nodes.length === 0) {
    lines.push("callees[0]:");
    lines.push("");
    lines.push("(no callees found)");
    return lines.join("\n");
  }

  lines.push(`callees[${nodes.length}]:`);
  if (options.snippetsOmitted) {
    lines.push("(snippets omitted due to high callee count)");
  }
  lines.push("");

  // Group by file
  const fileGroups = groupByFile(nodes);

  // Sort files alphabetically for consistent output
  const sortedFiles = Array.from(fileGroups.keys()).sort();

  for (const filePath of sortedFiles) {
    const fileNodes = fileGroups.get(filePath);
    if (!fileNodes || fileNodes.length === 0) continue;

    // File header
    lines.push(`${filePath} (${fileNodes.length} callees):`);

    // Group by type within the file
    const typeGroups = groupByType(fileNodes);

    // Output in consistent order (skip File nodes - they're metadata)
    for (const type of TYPE_ORDER) {
      const typeNodes = typeGroups.get(type);
      if (!typeNodes || typeNodes.length === 0) continue;

      const plural = TYPE_PLURALS[type];
      lines.push(`  ${plural}[${typeNodes.length}]:`);

      for (const node of typeNodes) {
        const loc = formatLocation(node);
        lines.push(`    ${formatNode(node)}`);
        lines.push(`      offset: ${loc.offset}, limit: ${loc.limit}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Format callees with code snippets showing call sites.
 *
 * Output format:
 * ```
 * source:
 *   name: handleRequest
 *   ...
 *
 * callees[2]:
 *
 * src/utils/validator.ts (1 callee):
 *   functions[1]:
 *     validate [10-25] async (data:unknown) → boolean
 *       offset: 10, limit: 16
 *       call at line 18:
 *         const isValid = await validate(req.body);
 *         if (!isValid) {
 *           throw new Error("Invalid data");
 * ```
 */
export function formatCalleesWithSnippets(
  source: SymbolLocation,
  callees: CalleeWithSnippets[],
): string {
  const lines: string[] = [];

  // Header - same as formatCallees
  lines.push("source:");
  lines.push(`  name: ${source.name}`);
  lines.push(`  type: ${source.type}`);
  lines.push(`  file: ${source.file}`);
  lines.push(`  offset: ${source.offset}`);
  lines.push(`  limit: ${source.limit}`);
  lines.push(...formatModulePackageLines(source.module, source.package, "  "));
  lines.push("");

  if (callees.length === 0) {
    lines.push("callees[0]:");
    lines.push("");
    lines.push("(no callees found)");
    return lines.join("\n");
  }

  lines.push(`callees[${callees.length}]:`);
  lines.push("");

  // Group by file
  const calleesByFile = new Map<string, CalleeWithSnippets[]>();
  for (const callee of callees) {
    const file = callee.node.filePath;
    const existing = calleesByFile.get(file) ?? [];
    existing.push(callee);
    calleesByFile.set(file, existing);
  }

  // Sort files alphabetically
  const sortedFiles = Array.from(calleesByFile.keys()).sort();

  for (const filePath of sortedFiles) {
    const fileCallees = calleesByFile.get(filePath);
    if (!fileCallees || fileCallees.length === 0) continue;

    lines.push(`${filePath} (${fileCallees.length} callees):`);

    // Group by type within file
    const nodesByType = new Map<string, CalleeWithSnippets[]>();
    for (const callee of fileCallees) {
      const type = callee.node.type;
      const existing = nodesByType.get(type) ?? [];
      existing.push(callee);
      nodesByType.set(type, existing);
    }

    for (const type of TYPE_ORDER) {
      const typeCallees = nodesByType.get(type);
      if (!typeCallees || typeCallees.length === 0) continue;

      const plural = TYPE_PLURALS[type];
      lines.push(`  ${plural}[${typeCallees.length}]:`);

      for (const callee of typeCallees) {
        const loc = formatLocation(callee.node);
        lines.push(`    ${formatNode(callee.node)}`);
        lines.push(`      offset: ${loc.offset}, limit: ${loc.limit}`);

        // Add snippets
        for (const snippet of callee.snippets) {
          // callSiteLine undefined = whole function body
          if (snippet.callSiteLine === undefined) {
            lines.push("      function body:");
          } else {
            lines.push(`      call at line ${snippet.callSiteLine}:`);
          }
          // Indent each line of code
          const codeLines = snippet.code.split("\n");
          for (const codeLine of codeLines) {
            lines.push(`        ${codeLine}`);
          }
        }
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
