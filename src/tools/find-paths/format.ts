import type { Edge } from "../../db/Types.js";
import {
  extractSymbol,
  formatModulePackageLines,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import type { PathResult } from "./query.js";

/**
 * Format a not_found result.
 *
 * @param symbolLabel - Label like "from.symbol: formatDate" or "to.symbol: save"
 * @param suggestions - Optional fuzzy match suggestions
 */
export function formatNotFound(
  symbolLabel: string,
  suggestions?: string[],
): string {
  const lines: string[] = [];
  lines.push(`error: ${symbolLabel} not found`);

  if (suggestions && suggestions.length > 0) {
    lines.push("");
    lines.push("Did you mean:");
    for (const suggestion of suggestions) {
      lines.push(`  - ${suggestion}`);
    }
  }

  // Extract the parameter name (from or to) and symbol for examples
  const paramMatch = symbolLabel.match(/^(from|to)\.symbol:\s*(.+)$/);
  const param = paramMatch?.[1];
  const symbol = paramMatch?.[2];
  if (param && symbol) {
    lines.push("");
    lines.push("Narrow your query with file, module, or package:");
    lines.push(`  ${param}: { symbol: "${symbol}", file: "src/..." }`);
    lines.push(`  ${param}: { symbol: "${symbol}", module: "..." }`);
  }

  return lines.join("\n");
}

/**
 * Format an ambiguous result.
 *
 * @param symbolLabel - Label like "from.symbol: formatDate" or "to.symbol: save"
 * @param candidates - All matching symbols
 */
export function formatAmbiguous(
  symbolLabel: string,
  candidates: SymbolLocation[],
): string {
  const lines: string[] = [];
  lines.push(
    `error: ${symbolLabel} is ambiguous (${candidates.length} matches)`,
  );
  lines.push("");
  lines.push("candidates:");

  for (const candidate of candidates) {
    const symbol = extractSymbol(candidate.id);
    lines.push(`  - ${symbol} (${candidate.type})`);
    lines.push(`    file: ${candidate.file}`);
    const metaLines = formatModulePackageLines(
      candidate.module,
      candidate.package,
      "    ",
    );
    if (metaLines.length > 0) {
      lines.push(metaLines.join(", "));
    }
    lines.push(`    offset: ${candidate.offset}, limit: ${candidate.limit}`);
  }

  // Generate example disambiguation syntax
  const paramMatch = symbolLabel.match(/^(from|to)\.symbol:\s*(.+)$/);
  const param = paramMatch?.[1];
  const symbol = paramMatch?.[2];
  if (param && symbol && candidates.length > 0) {
    const examples = generateFindPathsExamples(param, symbol, candidates);
    lines.push("");
    lines.push("Narrow your query with file, module, or package:");
    for (const example of examples) {
      lines.push(`  ${example}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate disambiguation examples for findPaths parameters.
 */
function generateFindPathsExamples(
  param: string,
  symbol: string,
  candidates: SymbolLocation[],
): string[] {
  const examples: string[] = [];
  const first = candidates[0];
  if (!first) return examples;

  const uniqueFiles = new Set(candidates.map((c) => c.file));
  const uniqueModules = new Set(candidates.map((c) => c.module));
  const uniquePackages = new Set(candidates.map((c) => c.package));

  if (uniqueFiles.size > 1) {
    examples.push(`${param}: { symbol: "${symbol}", file: "${first.file}" }`);
  }
  if (uniqueModules.size > 1) {
    examples.push(
      `${param}: { symbol: "${symbol}", module: "${first.module}" }`,
    );
  }
  if (uniquePackages.size > 1) {
    examples.push(
      `${param}: { symbol: "${symbol}", package: "${first.package}" }`,
    );
  }

  // Fallback
  if (examples.length === 0) {
    examples.push(`${param}: { symbol: "${symbol}", file: "${first.file}" }`);
  }

  return examples.slice(0, 3);
}

/**
 * Format path results for LLM consumption.
 *
 * Uses a compact linear notation that shows paths as chains:
 * ```
 * from: formatDate (Function)
 *   file: src/utils.ts
 *   offset: 15, limit: 6
 *
 * to: saveData (Function)
 *   file: src/db.ts
 *   offset: 42, limit: 8
 *
 * paths: 2
 *
 * [1] length: 1
 *     formatDate --CALLS--> saveData
 *
 * [2] length: 2
 *     formatDate --CALLS--> process --CALLS--> saveData
 * ```
 *
 * @param from - The source symbol location
 * @param to - The target symbol location
 * @param paths - Array of path results (empty if no paths found)
 * @returns Formatted string for LLM consumption
 */
export function formatPaths(
  from: SymbolLocation,
  to: SymbolLocation,
  paths: PathResult[],
): string {
  const lines: string[] = [];

  // From section
  const fromSymbol = extractSymbol(from.id);
  lines.push(`from: ${fromSymbol} (${from.type})`);
  lines.push(`  file: ${from.file}`);
  lines.push(`  offset: ${from.offset}, limit: ${from.limit}`);
  lines.push("");

  // To section
  const toSymbol = extractSymbol(to.id);
  lines.push(`to: ${toSymbol} (${to.type})`);
  lines.push(`  file: ${to.file}`);
  lines.push(`  offset: ${to.offset}, limit: ${to.limit}`);
  lines.push("");

  if (paths.length === 0) {
    lines.push("paths: 0");
    lines.push("");
    lines.push("(no path exists between these symbols)");
    return lines.join("\n");
  }

  lines.push(`paths: ${paths.length}`);
  lines.push("");

  // Format each path
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    if (!path) continue;

    const pathChain = buildPathChain(path.nodes, path.edges);
    lines.push(`[${i + 1}] length: ${path.edges.length}`);
    lines.push(`    ${pathChain}`);

    // Add blank line between paths (but not after the last one)
    if (i < paths.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Build a linear path chain showing nodes connected by edge types.
 *
 * Example: "formatDate --CALLS--> process --CALLS--> saveData"
 */
function buildPathChain(nodes: string[], edges: Edge[]): string {
  if (nodes.length === 0) return "(empty path)";
  if (nodes.length === 1) {
    const node = nodes[0];
    return node ? extractSymbol(node) : "(unknown)";
  }

  const parts: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node === undefined) continue;

    // Extract symbol name from full ID
    parts.push(extractSymbol(node));

    // Add edge arrow if there's a next node
    if (i < edges.length) {
      const edge = edges[i];
      const edgeType = edge?.type ?? "???";
      parts.push(`--${edgeType}-->`);
    }
  }

  return parts.join(" ");
}
