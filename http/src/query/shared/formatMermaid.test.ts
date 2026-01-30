import { describe, expect, it } from "vitest";
import { formatMermaid } from "./formatMermaid.js";
import type { GraphEdge } from "./GraphTypes.js";
import type { NodeMetadata } from "./queryNodeMetadata.js";

describe("formatMermaid", () => {
  it("returns empty state for no edges", () => {
    const result = formatMermaid([]);

    const expected = `graph LR
  empty[No data]`;

    expect(result).toBe(expected);
  });

  it("skips subgraph for single symbol (self-referencing edge)", () => {
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/a.ts:fnA", type: "CALLS" },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnA_0 -->|CALLS| fnA_0`;

    expect(result).toBe(expected);
  });

  it("skips subgraphs when each file has single symbol", () => {
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnB_1["fnB"]
  fnA_0 -->|CALLS| fnB_1`;

    expect(result).toBe(expected);
  });

  it("skips subgraphs for chain when each file has single symbol", () => {
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnB_1["fnB"]
  fnC_2["fnC"]
  fnA_0 -->|CALLS| fnB_1
  fnB_1 -->|CALLS| fnC_2`;

    expect(result).toBe(expected);
  });

  it("uses subgraph only for files with multiple symbols", () => {
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/a.ts:fnB", type: "CALLS" },
      { source: "src/a.ts:fnB", target: "src/b.ts:fnC", type: "CALLS" },
    ];

    const result = formatMermaid(edges);

    // src/a.ts has 2 symbols -> subgraph
    // src/b.ts has 1 symbol -> no subgraph
    const expected = `graph LR
  subgraph sg_0["src/a.ts"]
    fnA_0["fnA"]
    fnB_1["fnB"]
  end
  fnC_2["fnC"]
  fnA_0 -->|CALLS| fnB_1
  fnB_1 -->|CALLS| fnC_2`;

    expect(result).toBe(expected);
  });

  it("formats different edge types without subgraphs for single-symbol files", () => {
    const edges: GraphEdge[] = [
      { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      { source: "src/a.ts:fnA", target: "src/c.ts:fnC", type: "REFERENCES" },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnB_1["fnB"]
  fnC_2["fnC"]
  fnA_0 -->|CALLS| fnB_1
  fnA_0 -->|REFERENCES| fnC_2`;

    expect(result).toBe(expected);
  });

  it("handles method names with dot notation without subgraphs", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/service.ts:UserService.save",
        target: "src/db.ts:db.insert",
        type: "CALLS",
      },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  UserService_save_0["UserService.save"]
  db_insert_1["db.insert"]
  UserService_save_0 -->|CALLS| db_insert_1`;

    expect(result).toBe(expected);
  });

  describe("package grouping", () => {
    it("groups by package when multiple packages present", () => {
      const edges: GraphEdge[] = [
        { source: "src/api.ts:handler", target: "shared/utils.ts:format", type: "CALLS" },
        { source: "shared/utils.ts:format", target: "shared/helpers.ts:helper", type: "CALLS" },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/api.ts:handler", { package: "http", type: "Function" }],
        ["shared/utils.ts:format", { package: "shared", type: "Function" }],
        ["shared/helpers.ts:helper", { package: "shared", type: "Function" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      // http package has 1 symbol -> no subgraph
      // shared package has 2 symbols -> subgraph
      expect(result).not.toContain('subgraph sg_0["http"]');
      expect(result).toContain('subgraph sg_0["shared"]');
      expect(result).toContain('["handler()"]');
      // Should NOT contain file paths as subgraph labels
      expect(result).not.toContain('["src/api.ts"]');
      expect(result).not.toContain('["shared/utils.ts"]');
    });

    it("falls back to file grouping when single package", () => {
      const edges: GraphEdge[] = [
        { source: "src/api.ts:handler", target: "src/service.ts:process", type: "CALLS" },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/api.ts:handler", { package: "http", type: "Function" }],
        ["src/service.ts:process", { package: "http", type: "Function" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      // Single package -> falls back to file grouping
      // Each file has 1 symbol -> no subgraphs
      expect(result).not.toContain("subgraph");
      expect(result).toContain('["handler()"]');
      expect(result).toContain('["process()"]');
    });

    it("falls back to file grouping when no metadata provided", () => {
      const edges: GraphEdge[] = [
        { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      ];

      const result = formatMermaid(edges);

      // Each file has 1 symbol -> no subgraphs
      expect(result).not.toContain("subgraph");
      expect(result).toContain('fnA_0["fnA"]');
      expect(result).toContain('fnB_1["fnB"]');
    });

    it("groups multiple nodes from same package together", () => {
      const edges: GraphEdge[] = [
        { source: "http/api.ts:handler", target: "http/service.ts:process", type: "CALLS" },
        { source: "http/service.ts:process", target: "shared/utils.ts:format", type: "CALLS" },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["http/api.ts:handler", { package: "http", type: "Function" }],
        ["http/service.ts:process", { package: "http", type: "Function" }],
        ["shared/utils.ts:format", { package: "shared", type: "Function" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      // http package has 2 symbols -> subgraph
      // shared package has 1 symbol -> no subgraph
      expect(result).toContain('subgraph sg_0["http"]');
      expect(result).toContain('["handler()"]');
      expect(result).toContain('["process()"]');
      expect(result).not.toContain('subgraph sg_1["shared"]');
      expect(result).toContain('["format()"]');
    });
  });

  describe("maxNodes truncation", () => {
    it("truncates graph when node count exceeds maxNodes", () => {
      // Create a chain: A -> B -> C -> D -> E (5 nodes)
      const edges: GraphEdge[] = [
        { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
        { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
        { source: "src/c.ts:fnC", target: "src/d.ts:fnD", type: "CALLS" },
        { source: "src/d.ts:fnD", target: "src/e.ts:fnE", type: "CALLS" },
      ];

      const result = formatMermaid(edges, { maxNodes: 3 });

      // Should only include first 3 nodes (A, B, C) and edges between them
      expect(result).toContain("fnA");
      expect(result).toContain("fnB");
      expect(result).toContain("fnC");
      expect(result).not.toContain("fnD");
      expect(result).not.toContain("fnE");
      // Should include truncation comment
      expect(result).toContain("%% (3/5 nodes displayed)");
      // No subgraphs since each file has 1 symbol
      expect(result).not.toContain("subgraph");
    });

    it("does not truncate when node count is within maxNodes", () => {
      const edges: GraphEdge[] = [
        { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
        { source: "src/b.ts:fnB", target: "src/c.ts:fnC", type: "CALLS" },
      ];

      const result = formatMermaid(edges, { maxNodes: 10 });

      // All nodes should be present
      expect(result).toContain("fnA");
      expect(result).toContain("fnB");
      expect(result).toContain("fnC");
      // No truncation message
      expect(result).not.toContain("%%");
    });
  });

  describe("type-aware display names", () => {
    it("adds parentheses to Function nodes", () => {
      const edges: GraphEdge[] = [
        { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/a.ts:fnA", { package: "test", type: "Function" }],
        ["src/b.ts:fnB", { package: "test", type: "Function" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      expect(result).toContain('["fnA()"]');
      expect(result).toContain('["fnB()"]');
    });

    it("adds parentheses to Method nodes", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/User.ts:User.save",
          target: "src/db.ts:db.insert",
          type: "CALLS",
        },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/User.ts:User.save", { package: "test", type: "Method" }],
        ["src/db.ts:db.insert", { package: "test", type: "Method" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      expect(result).toContain('["User.save()"]');
      expect(result).toContain('["db.insert()"]');
    });

    it("escapes angle brackets as HTML entities for React components", () => {
      const edges: GraphEdge[] = [
        { source: "src/App.tsx:App", target: "src/Button.tsx:Button", type: "INCLUDES" },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/App.tsx:App", { package: "test", type: "Function" }],
        ["src/Button.tsx:Button", { package: "test", type: "Function" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      // App is source of INCLUDES, not target -> shows as function
      expect(result).toContain('["App()"]');
      // Button is target of INCLUDES -> shows as component with escaped angle brackets
      expect(result).toContain('["&lt;Button&gt;"]');
    });

    it("leaves Variable nodes unchanged (arrow functions are now Function type)", () => {
      const edges: GraphEdge[] = [
        { source: "src/a.ts:fnA", target: "src/config.ts:config", type: "REFERENCES" },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/a.ts:fnA", { package: "test", type: "Function" }],
        ["src/config.ts:config", { package: "test", type: "Variable" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      expect(result).toContain('["fnA()"]');
      expect(result).toContain('["config"]');
      expect(result).not.toContain('["config()"]');
    });

    it("leaves Class nodes unchanged", () => {
      const edges: GraphEdge[] = [
        { source: "src/a.ts:fnA", target: "src/User.ts:User", type: "REFERENCES" },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/a.ts:fnA", { package: "test", type: "Function" }],
        ["src/User.ts:User", { package: "test", type: "Class" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      expect(result).toContain('["fnA()"]');
      expect(result).toContain('["User"]');
      expect(result).not.toContain('["User()"]');
    });

    it("leaves Interface nodes unchanged", () => {
      const edges: GraphEdge[] = [
        { source: "src/a.ts:fnA", target: "src/types.ts:Config", type: "REFERENCES" },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/a.ts:fnA", { package: "test", type: "Function" }],
        ["src/types.ts:Config", { package: "test", type: "Interface" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      expect(result).toContain('["fnA()"]');
      expect(result).toContain('["Config"]');
      expect(result).not.toContain('["Config()"]');
    });

    it("works without metadata (backwards compatible)", () => {
      const edges: GraphEdge[] = [
        { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      ];

      const result = formatMermaid(edges);

      // Without type info, names remain unchanged
      expect(result).toContain('["fnA"]');
      expect(result).toContain('["fnB"]');
    });
  });
});
