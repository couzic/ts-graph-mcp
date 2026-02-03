/**
 * Converts MCP graph output format to mermaid syntax.
 *
 * @example
 * const mcp = `## Graph
 *
 * fnA --CALLS--> fnB --CALLS--> fnC
 *
 * ## Nodes
 * ...`;
 * const mermaid = mcpToMermaid(mcp);
 * // Returns: "graph LR\n  fnA --> fnB\n  fnB --> fnC"
 */
export const mcpToMermaid = (mcpOutput: string): string => {
  // Extract the Graph section
  const graphMatch = mcpOutput.match(/## Graph\s*\n([\s\S]*?)(?=\n## |$)/);
  if (!graphMatch || !graphMatch[1]) {
    return "graph LR\n  NoGraph[No graph data found]";
  }

  const graphSection = graphMatch[1].trim();
  if (!graphSection) {
    return "graph LR\n  Empty[No connections found]";
  }

  const edges: Array<{ from: string; to: string; type: string }> = [];
  const lines = graphSection.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    // Parse chains like: fnA --CALLS--> fnB --REFERENCES--> fnC
    const parts = line.split(/\s+(--\w+-->)\s+/);

    for (let i = 0; i < parts.length - 2; i += 2) {
      const fromPart = parts[i];
      const edgeType = parts[i + 1];
      const toPart = parts[i + 2];

      if (!fromPart || !edgeType || !toPart) {
        continue;
      }

      const from = fromPart.trim();
      const to = toPart.trim();

      if (from && to) {
        const type = edgeType.replace(/^--|-->$/g, "");
        edges.push({ from, to, type });
      }
    }
  }

  if (edges.length === 0) {
    return "graph LR\n  NoEdges[No edges found]";
  }

  // Build mermaid syntax
  const mermaidLines = edges.map(({ from, to, type }) => {
    const safeFrom = sanitizeNodeId(from);
    const safeTo = sanitizeNodeId(to);
    const label = type !== "CALLS" ? `|${type}|` : "";
    return `  ${safeFrom} -->${label} ${safeTo}`;
  });

  return `graph LR\n${mermaidLines.join("\n")}`;
};

/**
 * Sanitizes a node ID for mermaid by escaping special characters.
 */
const sanitizeNodeId = (id: string): string => {
  // Replace dots and special chars with underscores for the ID
  // but keep the original as the display label
  if (id.includes(".") || id.includes(":") || id.includes("-")) {
    const safeId = id.replace(/[.:-]/g, "_");
    return `${safeId}["${id}"]`;
  }
  return id;
};
