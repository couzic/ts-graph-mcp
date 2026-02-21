import { describe, expect, it } from "vitest";
import { findConnectedComponents, formatMermaid } from "./formatMermaid.js";
import type { GraphEdge } from "./GraphTypes.js";
import type { NodeMetadata } from "./queryNodeMetadata.js";

describe("formatMermaid", () => {
  it("returns empty state for no edges", () => {
    const result = formatMermaid([]);

    const expected = `graph LR
  empty[No data]`;

    expect(result).toEqual([expected]);
  });

  it("skips subgraph for single symbol (self-referencing edge)", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/a.ts:Function:fnA",
        target: "src/a.ts:Function:fnA",
        type: "CALLS",
      },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnA_0 -->|CALLS| fnA_0`;

    expect(result).toEqual([expected]);
  });

  it("skips subgraphs when each file has single symbol", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/a.ts:Function:fnA",
        target: "src/b.ts:Function:fnB",
        type: "CALLS",
      },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnB_1["fnB"]
  fnA_0 -->|CALLS| fnB_1`;

    expect(result).toEqual([expected]);
  });

  it("skips subgraphs for chain when each file has single symbol", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/a.ts:Function:fnA",
        target: "src/b.ts:Function:fnB",
        type: "CALLS",
      },
      {
        source: "src/b.ts:Function:fnB",
        target: "src/c.ts:Function:fnC",
        type: "CALLS",
      },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnB_1["fnB"]
  fnC_2["fnC"]
  fnA_0 -->|CALLS| fnB_1
  fnB_1 -->|CALLS| fnC_2`;

    expect(result).toEqual([expected]);
  });

  it("uses subgraph only for files with multiple symbols", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/a.ts:Function:fnA",
        target: "src/a.ts:Function:fnB",
        type: "CALLS",
      },
      {
        source: "src/a.ts:Function:fnB",
        target: "src/b.ts:Function:fnC",
        type: "CALLS",
      },
    ];

    const result = formatMermaid(edges);

    // src/a.ts has 2 symbols -> subgraph
    // src/b.ts has 1 symbol -> no subgraph
    const expected = `graph TD
  subgraph sg_0["src/a.ts"]
    fnA_0["fnA"]
    fnB_1["fnB"]
  end
  fnC_2["fnC"]
  fnA_0 -->|CALLS| fnB_1
  fnB_1 -->|CALLS| fnC_2`;

    expect(result).toEqual([expected]);
  });

  it("formats different edge types without subgraphs for single-symbol files", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/a.ts:Function:fnA",
        target: "src/b.ts:Function:fnB",
        type: "CALLS",
      },
      {
        source: "src/a.ts:Function:fnA",
        target: "src/c.ts:Function:fnC",
        type: "REFERENCES",
      },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  fnA_0["fnA"]
  fnB_1["fnB"]
  fnC_2["fnC"]
  fnA_0 -->|CALLS| fnB_1
  fnA_0 -->|REFERENCES| fnC_2`;

    expect(result).toEqual([expected]);
  });

  it("handles method names with dot notation without subgraphs", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/service.ts:Method:UserService.save",
        target: "src/db.ts:Method:db.insert",
        type: "CALLS",
      },
    ];

    const result = formatMermaid(edges);

    const expected = `graph LR
  UserService_save_0["UserService.save"]
  db_insert_1["db.insert"]
  UserService_save_0 -->|CALLS| db_insert_1`;

    expect(result).toEqual([expected]);
  });

  describe("direction option", () => {
    it("uses explicit LR direction on empty graph", () => {
      const result = formatMermaid([], { direction: "LR" });
      expect(result).toEqual(["graph LR\n  empty[No data]"]);
    });

    it("uses explicit TD direction on empty graph", () => {
      const result = formatMermaid([], { direction: "TD" });
      expect(result).toEqual(["graph TD\n  empty[No data]"]);
    });

    it("overrides default LR with TD when no subgraphs", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/b.ts:Function:fnB",
          type: "CALLS",
        },
      ];

      const result = formatMermaid(edges, { direction: "TD" });

      expect(result[0]).toMatch(/^graph TD/);
    });

    it("overrides default TD with LR when subgraphs present", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/a.ts:Function:fnB",
          type: "CALLS",
        },
        {
          source: "src/a.ts:Function:fnB",
          target: "src/b.ts:Function:fnC",
          type: "CALLS",
        },
      ];

      const result = formatMermaid(edges, { direction: "LR" });

      expect(result[0]).toMatch(/^graph LR/);
    });
  });

  describe("package grouping", () => {
    it("groups by package when multiple packages present", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/api.ts:Function:handler",
          target: "shared/utils.ts:Function:format",
          type: "CALLS",
        },
        {
          source: "shared/utils.ts:Function:format",
          target: "shared/helpers.ts:Function:helper",
          type: "CALLS",
        },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/api.ts:Function:handler", { package: "http", type: "Function" }],
        [
          "shared/utils.ts:Function:format",
          { package: "shared", type: "Function" },
        ],
        [
          "shared/helpers.ts:Function:helper",
          { package: "shared", type: "Function" },
        ],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      // http package has 1 symbol -> no subgraph
      // shared package has 2 symbols -> subgraph
      const output = result.join("\n");
      expect(output).not.toContain('subgraph sg_0["http"]');
      expect(output).toContain('subgraph sg_0["shared"]');
      expect(output).toContain('["handler()"]');
      // Should NOT contain file paths as subgraph labels
      expect(output).not.toContain('["src/api.ts"]');
      expect(output).not.toContain('["shared/utils.ts"]');
    });

    it("falls back to file grouping when single package", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/api.ts:Function:handler",
          target: "src/service.ts:Function:process",
          type: "CALLS",
        },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/api.ts:Function:handler", { package: "http", type: "Function" }],
        [
          "src/service.ts:Function:process",
          { package: "http", type: "Function" },
        ],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      // Single package -> falls back to file grouping
      // Each file has 1 symbol -> no subgraphs
      const output = result.join("\n");
      expect(output).not.toContain("subgraph");
      expect(output).toContain('["handler()"]');
      expect(output).toContain('["process()"]');
    });

    it("falls back to file grouping when no metadata provided", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/b.ts:Function:fnB",
          type: "CALLS",
        },
      ];

      const result = formatMermaid(edges);

      // Each file has 1 symbol -> no subgraphs
      const output = result.join("\n");
      expect(output).not.toContain("subgraph");
      expect(output).toContain('fnA_0["fnA"]');
      expect(output).toContain('fnB_1["fnB"]');
    });

    it("groups multiple nodes from same package together", () => {
      const edges: GraphEdge[] = [
        {
          source: "http/api.ts:Function:handler",
          target: "http/service.ts:Function:process",
          type: "CALLS",
        },
        {
          source: "http/service.ts:Function:process",
          target: "shared/utils.ts:Function:format",
          type: "CALLS",
        },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["http/api.ts:Function:handler", { package: "http", type: "Function" }],
        [
          "http/service.ts:Function:process",
          { package: "http", type: "Function" },
        ],
        [
          "shared/utils.ts:Function:format",
          { package: "shared", type: "Function" },
        ],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      // http package has 2 symbols -> subgraph
      // shared package has 1 symbol -> no subgraph
      const output = result.join("\n");
      expect(output).toContain('subgraph sg_0["http"]');
      expect(output).toContain('["handler()"]');
      expect(output).toContain('["process()"]');
      expect(output).not.toContain('subgraph sg_1["shared"]');
      expect(output).toContain('["format()"]');
    });
  });

  describe("maxNodes truncation", () => {
    it("truncates graph when node count exceeds maxNodes", () => {
      // Create a chain: A -> B -> C -> D -> E (5 nodes)
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/b.ts:Function:fnB",
          type: "CALLS",
        },
        {
          source: "src/b.ts:Function:fnB",
          target: "src/c.ts:Function:fnC",
          type: "CALLS",
        },
        {
          source: "src/c.ts:Function:fnC",
          target: "src/d.ts:Function:fnD",
          type: "CALLS",
        },
        {
          source: "src/d.ts:Function:fnD",
          target: "src/e.ts:Function:fnE",
          type: "CALLS",
        },
      ];

      const result = formatMermaid(edges, { maxNodes: 3 });

      // Should only include first 3 nodes (A, B, C) and edges between them
      const output = result.join("\n");
      expect(output).toContain("fnA");
      expect(output).toContain("fnB");
      expect(output).toContain("fnC");
      expect(output).not.toContain("fnD");
      expect(output).not.toContain("fnE");
      // No subgraphs since each file has 1 symbol
      expect(output).not.toContain("subgraph");
    });

    it("does not truncate when node count is within maxNodes", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/b.ts:Function:fnB",
          type: "CALLS",
        },
        {
          source: "src/b.ts:Function:fnB",
          target: "src/c.ts:Function:fnC",
          type: "CALLS",
        },
      ];

      const result = formatMermaid(edges, { maxNodes: 10 });

      // All nodes should be present
      const output = result.join("\n");
      expect(output).toContain("fnA");
      expect(output).toContain("fnB");
      expect(output).toContain("fnC");
      // No truncation message
      expect(output).not.toContain("%%");
    });
  });

  describe("type-aware display names", () => {
    it("adds parentheses to Function nodes", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/b.ts:Function:fnB",
          type: "CALLS",
        },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/a.ts:Function:fnA", { package: "test", type: "Function" }],
        ["src/b.ts:Function:fnB", { package: "test", type: "Function" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      const output = result.join("\n");
      expect(output).toContain('["fnA()"]');
      expect(output).toContain('["fnB()"]');
    });

    it("adds parentheses to Method nodes", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/User.ts:Method:User.save",
          target: "src/db.ts:Method:db.insert",
          type: "CALLS",
        },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/User.ts:Method:User.save", { package: "test", type: "Method" }],
        ["src/db.ts:Method:db.insert", { package: "test", type: "Method" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      const output = result.join("\n");
      expect(output).toContain('["User.save()"]');
      expect(output).toContain('["db.insert()"]');
    });

    it("escapes angle brackets as HTML entities for React components", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/App.tsx:Function:App",
          target: "src/Button.tsx:Function:Button",
          type: "INCLUDES",
        },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/App.tsx:Function:App", { package: "test", type: "Function" }],
        [
          "src/Button.tsx:Function:Button",
          { package: "test", type: "Function" },
        ],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      const output = result.join("\n");
      // App is source of INCLUDES, not target -> shows as function
      expect(output).toContain('["App()"]');
      // Button is target of INCLUDES -> shows as component with escaped angle brackets
      expect(output).toContain('["&lt;Button&gt;"]');
    });

    it("leaves Variable nodes unchanged (arrow functions are now Function type)", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/config.ts:Variable:config",
          type: "REFERENCES",
        },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/a.ts:Function:fnA", { package: "test", type: "Function" }],
        [
          "src/config.ts:Variable:config",
          { package: "test", type: "Variable" },
        ],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      const output = result.join("\n");
      expect(output).toContain('["fnA()"]');
      expect(output).toContain('["config"]');
      expect(output).not.toContain('["config()"]');
    });

    it("leaves Class nodes unchanged", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/User.ts:Class:User",
          type: "REFERENCES",
        },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/a.ts:Function:fnA", { package: "test", type: "Function" }],
        ["src/User.ts:Class:User", { package: "test", type: "Class" }],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      const output = result.join("\n");
      expect(output).toContain('["fnA()"]');
      expect(output).toContain('["User"]');
      expect(output).not.toContain('["User()"]');
    });

    it("leaves Interface nodes unchanged", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/types.ts:Interface:Config",
          type: "REFERENCES",
        },
      ];
      const metadataByNodeId = new Map<string, NodeMetadata>([
        ["src/a.ts:Function:fnA", { package: "test", type: "Function" }],
        [
          "src/types.ts:Interface:Config",
          { package: "test", type: "Interface" },
        ],
      ]);

      const result = formatMermaid(edges, { metadataByNodeId });

      const output = result.join("\n");
      expect(output).toContain('["fnA()"]');
      expect(output).toContain('["Config"]');
      expect(output).not.toContain('["Config()"]');
    });

    it("works without metadata (backwards compatible)", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/b.ts:Function:fnB",
          type: "CALLS",
        },
      ];

      const result = formatMermaid(edges);

      // Without type info, names remain unchanged
      const output = result.join("\n");
      expect(output).toContain('["fnA"]');
      expect(output).toContain('["fnB"]');
    });

    it("escapes angle brackets in generic type display names", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/edge.ts:Function:edge",
          target: "src/edge.ts:SyntheticType:ReturnType<typeof edge>",
          type: "RETURNS",
        },
      ];

      const result = formatMermaid(edges);

      const output = result.join("\n");
      expect(output).not.toContain("<typeof");
      expect(output).toContain("&lt;typeof edge&gt;");
    });
  });

  describe("connected components", () => {
    it("splits disconnected edges into separate diagrams", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/b.ts:Function:fnB",
          type: "CALLS",
        },
        {
          source: "src/c.ts:Function:fnC",
          target: "src/d.ts:Function:fnD",
          type: "CALLS",
        },
      ];

      const result = formatMermaid(edges);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("fnA");
      expect(result[0]).toContain("fnB");
      expect(result[0]).not.toContain("fnC");
      expect(result[1]).toContain("fnC");
      expect(result[1]).toContain("fnD");
      expect(result[1]).not.toContain("fnA");
    });

    it("keeps connected graph as single diagram", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/b.ts:Function:fnB",
          type: "CALLS",
        },
        {
          source: "src/b.ts:Function:fnB",
          target: "src/c.ts:Function:fnC",
          type: "CALLS",
        },
      ];

      const result = formatMermaid(edges);

      expect(result).toHaveLength(1);
    });

    it("produces separate graph headers per component", () => {
      const edges: GraphEdge[] = [
        {
          source: "src/a.ts:Function:fnA",
          target: "src/b.ts:Function:fnB",
          type: "CALLS",
        },
        {
          source: "src/x.ts:Function:fnX",
          target: "src/y.ts:Function:fnY",
          type: "REFERENCES",
        },
      ];

      const result = formatMermaid(edges);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatch(/^graph LR/);
      expect(result[1]).toMatch(/^graph LR/);
    });
  });
});

describe("findConnectedComponents", () => {
  it("returns empty array for no edges", () => {
    expect(findConnectedComponents([])).toEqual([]);
  });

  it("groups connected edges together", () => {
    const edges: GraphEdge[] = [
      { source: "A", target: "B", type: "CALLS" },
      { source: "B", target: "C", type: "CALLS" },
    ];

    const components = findConnectedComponents(edges);
    expect(components).toHaveLength(1);
    expect(components[0]).toHaveLength(2);
  });

  it("separates disconnected edges", () => {
    const edges: GraphEdge[] = [
      { source: "A", target: "B", type: "CALLS" },
      { source: "C", target: "D", type: "CALLS" },
    ];

    const components = findConnectedComponents(edges);
    expect(components).toHaveLength(2);
    expect(components[0]).toHaveLength(1);
    expect(components[1]).toHaveLength(1);
  });

  it("handles three disconnected components", () => {
    const edges: GraphEdge[] = [
      { source: "A", target: "B", type: "CALLS" },
      { source: "C", target: "D", type: "CALLS" },
      { source: "E", target: "F", type: "CALLS" },
    ];

    const components = findConnectedComponents(edges);
    expect(components).toHaveLength(3);
  });

  it("merges components connected through shared node", () => {
    const edges: GraphEdge[] = [
      { source: "A", target: "B", type: "CALLS" },
      { source: "B", target: "C", type: "CALLS" },
      { source: "D", target: "E", type: "CALLS" },
    ];

    const components = findConnectedComponents(edges);
    expect(components).toHaveLength(2);
    expect(components[0]).toHaveLength(2); // A→B, B→C
    expect(components[1]).toHaveLength(1); // D→E
  });
});
