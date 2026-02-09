import { describe, expect, it } from "vitest";
import {
  formatMcpFromResult,
  formatMermaidFromResult,
  formatQueryResult,
} from "./formatFromResult.js";
import type { QueryResult } from "./QueryResult.js";

const emptyResult: QueryResult = {
  edges: [],
  nodes: [],
  aliasMap: new Map(),
  metadataByNodeId: new Map(),
};

const resultWithMessage: QueryResult = {
  ...emptyResult,
  message: "Resolved to MyClass.myMethod",
};

const resultWithEdges: QueryResult = {
  edges: [{ source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" }],
  nodes: [
    {
      id: "src/b.ts:fnB",
      name: "fnB",
      type: "Function",
      filePath: "src/b.ts",
      startLine: 1,
      endLine: 3,
      snippet: "function fnB() {\n  return 42;\n}",
    },
  ],
  aliasMap: new Map(),
  metadataByNodeId: new Map(),
};

describe(formatMcpFromResult.name, () => {
  it('returns "" for empty edges without message', () => {
    expect(formatMcpFromResult(emptyResult)).toBe("");
  });

  it("returns message for empty edges with message", () => {
    expect(formatMcpFromResult(resultWithMessage)).toBe(
      "Resolved to MyClass.myMethod",
    );
  });

  it("formats graph and nodes for non-empty edges", () => {
    const output = formatMcpFromResult(resultWithEdges);
    expect(output).toContain("## Graph");
    expect(output).toContain("fnA --CALLS--> fnB");
    expect(output).toContain("## Nodes");
  });

  it("prepends message to graph output", () => {
    const result: QueryResult = {
      ...resultWithEdges,
      message: "Note: resolved",
    };
    const output = formatMcpFromResult(result);
    expect(output).toMatch(/^Note: resolved\n\n## Graph/);
  });
});

describe(formatMermaidFromResult.name, () => {
  it("returns fallback diagram for empty edges without message", () => {
    expect(formatMermaidFromResult(emptyResult)).toBe(
      "graph LR\n  empty[No data]",
    );
  });

  it("returns message for empty edges with message", () => {
    expect(formatMermaidFromResult(resultWithMessage)).toBe(
      "Resolved to MyClass.myMethod",
    );
  });

  it("formats mermaid diagram for non-empty edges", () => {
    const output = formatMermaidFromResult(resultWithEdges);
    expect(output).toContain("graph LR");
    expect(output).toContain("CALLS");
  });
});

describe(formatQueryResult.name, () => {
  it("dispatches to MCP format by default", () => {
    expect(formatQueryResult(emptyResult)).toBe("");
  });

  it('dispatches to MCP format for "mcp"', () => {
    expect(formatQueryResult(emptyResult, "mcp")).toBe("");
  });

  it('dispatches to Mermaid format for "mermaid"', () => {
    expect(formatQueryResult(emptyResult, "mermaid")).toBe(
      "graph LR\n  empty[No data]",
    );
  });
});
