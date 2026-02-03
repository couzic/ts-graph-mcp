import { describe, expect, it } from "vitest";
import { mcpToMermaid } from "./mcpToMermaid.js";

describe("mcpToMermaid", () => {
  it("converts simple chain to mermaid", () => {
    const mcp = `## Graph

fnA --CALLS--> fnB --CALLS--> fnC

## Nodes

fnB:
  type: Function
  file: src/b.ts`;

    const result = mcpToMermaid(mcp);
    expect(result).toContain("graph LR");
    expect(result).toContain("fnA --> fnB");
    expect(result).toContain("fnB --> fnC");
  });

  it("converts multiple lines (branches)", () => {
    const mcp = `## Graph

entry --CALLS--> branchA
entry --CALLS--> branchB

## Nodes`;

    const result = mcpToMermaid(mcp);
    expect(result).toContain("entry --> branchA");
    expect(result).toContain("entry --> branchB");
  });

  it("includes edge type label for non-CALLS edges", () => {
    const mcp = `## Graph

classA --EXTENDS--> classB
classA --IMPLEMENTS--> interfaceC

## Nodes`;

    const result = mcpToMermaid(mcp);
    expect(result).toContain("classA -->|EXTENDS| classB");
    expect(result).toContain("classA -->|IMPLEMENTS| interfaceC");
  });

  it("handles node names with dots (methods)", () => {
    const mcp = `## Graph

User.save --CALLS--> Database.insert

## Nodes`;

    const result = mcpToMermaid(mcp);
    expect(result).toContain('User_save["User.save"]');
    expect(result).toContain('Database_insert["Database.insert"]');
  });

  it("returns placeholder when no graph section found", () => {
    const mcp = `Some error message without graph section`;

    const result = mcpToMermaid(mcp);
    expect(result).toContain("NoGraph");
  });

  it("returns placeholder when graph section has no edges", () => {
    const mcp = `## Graph

## Nodes`;

    const result = mcpToMermaid(mcp);
    expect(result).toContain("NoEdges");
  });
});
