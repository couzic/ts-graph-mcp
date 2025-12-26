import { describe, expect, it } from "vitest";
import type { Edge } from "../../db/Types.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatAmbiguous, formatNotFound, formatPaths } from "./format.js";
import type { PathResult } from "./query.js";

/**
 * Helper to create a SymbolLocation for testing.
 */
function createSymbolLocation(
  id: string,
  type = "Function",
  file = "src/test.ts",
): SymbolLocation {
  const parts = id.split(":");
  const name = parts[parts.length - 1] ?? id;
  return {
    id,
    name,
    type,
    file,
    offset: 1,
    limit: 10,
    module: "test",
    package: "test",
  };
}

describe.skip(formatPaths.name, () => {
  it("formats empty paths array as not found", () => {
    const from = createSymbolLocation("src/a.ts:foo");
    const to = createSymbolLocation("src/b.ts:bar");
    const result = formatPaths(from, to, []);

    expect(result).toContain("from: foo (Function)");
    expect(result).toContain("to: bar (Function)");
    expect(result).toContain("paths: 0");
    expect(result).toContain("(no path exists between these symbols)");
  });

  it("formats single path", () => {
    const from = createSymbolLocation("src/a.ts:foo");
    const to = createSymbolLocation("src/b.ts:bar");
    const paths: PathResult[] = [
      {
        nodes: ["src/a.ts:foo", "src/b.ts:bar"],
        edges: [
          {
            source: "src/a.ts:foo",
            target: "src/b.ts:bar",
            type: "CALLS",
          } as Edge,
        ],
      },
    ];

    const result = formatPaths(from, to, paths);

    expect(result).toContain("from: foo (Function)");
    expect(result).toContain("to: bar (Function)");
    expect(result).toContain("paths: 1");
    expect(result).toContain("[1] length: 1");
    expect(result).toContain("foo --CALLS--> bar");
  });

  it("formats multiple paths", () => {
    const from = createSymbolLocation("src/a.ts:A");
    const to = createSymbolLocation("src/c.ts:C");
    const paths: PathResult[] = [
      {
        nodes: ["src/a.ts:A", "src/c.ts:C"],
        edges: [
          { source: "src/a.ts:A", target: "src/c.ts:C", type: "CALLS" } as Edge,
        ],
      },
      {
        nodes: ["src/a.ts:A", "src/b.ts:B", "src/c.ts:C"],
        edges: [
          { source: "src/a.ts:A", target: "src/b.ts:B", type: "CALLS" } as Edge,
          {
            source: "src/b.ts:B",
            target: "src/c.ts:C",
            type: "IMPORTS",
          } as Edge,
        ],
      },
    ];

    const result = formatPaths(from, to, paths);

    expect(result).toContain("paths: 2");
    expect(result).toContain("[1] length: 1");
    expect(result).toContain("A --CALLS--> C");
    expect(result).toContain("[2] length: 2");
    expect(result).toContain("A --CALLS--> B --IMPORTS--> C");
  });

  it("formats long path correctly", () => {
    const from = createSymbolLocation("src/a.ts:start");
    const to = createSymbolLocation("src/e.ts:end");
    const paths: PathResult[] = [
      {
        nodes: [
          "src/a.ts:start",
          "src/b.ts:mid1",
          "src/c.ts:mid2",
          "src/d.ts:mid3",
          "src/e.ts:end",
        ],
        edges: [
          { source: "src/a.ts:start", target: "src/b.ts:mid1", type: "CALLS" },
          {
            source: "src/b.ts:mid1",
            target: "src/c.ts:mid2",
            type: "USES_TYPE",
          },
          { source: "src/c.ts:mid2", target: "src/d.ts:mid3", type: "EXTENDS" },
          { source: "src/d.ts:mid3", target: "src/e.ts:end", type: "CALLS" },
        ] as Edge[],
      },
    ];

    const result = formatPaths(from, to, paths);

    expect(result).toContain("[1] length: 4");
    expect(result).toContain("--CALLS-->");
    expect(result).toContain("--USES_TYPE-->");
    expect(result).toContain("--EXTENDS-->");
  });

  it("handles single-node path (source equals target)", () => {
    const from = createSymbolLocation("src/a.ts:foo");
    const to = createSymbolLocation("src/a.ts:foo");
    const paths: PathResult[] = [
      {
        nodes: ["src/a.ts:foo"],
        edges: [],
      },
    ];

    const result = formatPaths(from, to, paths);

    expect(result).toContain("paths: 1");
    expect(result).toContain("[1] length: 0");
    expect(result).toContain("foo");
    expect(result).not.toContain("-->");
  });

  it("handles IMPLEMENTS edge type", () => {
    const from = createSymbolLocation("src/interface.ts:IFoo");
    const to = createSymbolLocation("src/class.ts:Foo");
    const paths: PathResult[] = [
      {
        nodes: ["src/interface.ts:IFoo", "src/class.ts:Foo"],
        edges: [
          {
            source: "src/interface.ts:IFoo",
            target: "src/class.ts:Foo",
            type: "IMPLEMENTS",
          } as Edge,
        ],
      },
    ];

    const result = formatPaths(from, to, paths);

    expect(result).toContain("--IMPLEMENTS-->");
  });

  it("handles CONTAINS edge type", () => {
    const from = createSymbolLocation("src/file.ts", "File");
    const to = createSymbolLocation("src/file.ts:MyClass", "Class");
    const paths: PathResult[] = [
      {
        nodes: ["src/file.ts", "src/file.ts:MyClass"],
        edges: [
          {
            source: "src/file.ts",
            target: "src/file.ts:MyClass",
            type: "CONTAINS",
          } as Edge,
        ],
      },
    ];

    const result = formatPaths(from, to, paths);

    expect(result).toContain("--CONTAINS-->");
  });

  it("preserves node ID format with colons", () => {
    const from = createSymbolLocation("src/models/User.ts:User.save", "Method");
    const to = createSymbolLocation("src/db/Repo.ts:Repo.insert", "Method");
    const paths: PathResult[] = [
      {
        nodes: ["src/models/User.ts:User.save", "src/db/Repo.ts:Repo.insert"],
        edges: [
          {
            source: "src/models/User.ts:User.save",
            target: "src/db/Repo.ts:Repo.insert",
            type: "CALLS",
          } as Edge,
        ],
      },
    ];

    const result = formatPaths(from, to, paths);

    expect(result).toContain("from: User.save (Method)");
    expect(result).toContain("to: Repo.insert (Method)");
    expect(result).toContain("User.save --CALLS--> Repo.insert");
  });
});

describe.skip(formatNotFound.name, () => {
  it("formats error with example syntax for from parameter", () => {
    const result = formatNotFound("from.symbol: formatDate");

    expect(result).toContain("error: from.symbol: formatDate not found");
    expect(result).toContain(
      "Narrow your query with file, module, or package:",
    );
    expect(result).toContain('from: { symbol: "formatDate", file: "src/..." }');
    expect(result).toContain('from: { symbol: "formatDate", module: "..." }');
  });

  it("formats error with example syntax for to parameter", () => {
    const result = formatNotFound("to.symbol: save");

    expect(result).toContain("error: to.symbol: save not found");
    expect(result).toContain('to: { symbol: "save", file: "src/..." }');
  });

  it("includes suggestions when provided", () => {
    const result = formatNotFound("from.symbol: formatDat", [
      "formatDate",
      "formatTime",
    ]);

    expect(result).toContain("Did you mean:");
    expect(result).toContain("  - formatDate");
    expect(result).toContain("  - formatTime");
  });
});

describe.skip(formatAmbiguous.name, () => {
  const candidates: SymbolLocation[] = [
    {
      name: "save",
      type: "Function",
      file: "src/utils.ts",
      offset: 10,
      limit: 5,
      module: "utils",
      package: "core",
      id: "src/utils.ts:save",
    },
    {
      name: "save",
      type: "Method",
      file: "src/models/User.ts",
      offset: 20,
      limit: 8,
      module: "models",
      package: "core",
      id: "src/models/User.ts:User.save",
    },
  ];

  it("formats error with candidate list", () => {
    const result = formatAmbiguous("from.symbol: save", candidates);

    expect(result).toContain(
      "error: from.symbol: save is ambiguous (2 matches)",
    );
    expect(result).toContain("candidates:");
    expect(result).toContain("save (Function)");
    expect(result).toContain("User.save (Method)");
  });

  it("includes example syntax for from parameter", () => {
    const result = formatAmbiguous("from.symbol: save", candidates);

    expect(result).toContain(
      "Narrow your query with file, module, or package:",
    );
    expect(result).toContain('from: { symbol: "save", file: "src/utils.ts" }');
  });

  it("includes example syntax for to parameter", () => {
    const result = formatAmbiguous("to.symbol: save", candidates);

    expect(result).toContain('to: { symbol: "save", file: "src/utils.ts" }');
  });

  it("shows module example when candidates differ by module", () => {
    const result = formatAmbiguous("from.symbol: save", candidates);

    expect(result).toContain('from: { symbol: "save", module: "utils" }');
  });
});
