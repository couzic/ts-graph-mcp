import { describe, expect, it } from "vitest";
import { buildAliasMap } from "./buildAliasMap.js";
import type { GraphEdge } from "./GraphTypes.js";

describe(buildAliasMap.name, () => {
  it("extracts alias from ALIAS_FOR edge targeting SyntheticType", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/s.ts:TypeAlias:Service",
        target: "src/s.ts:SyntheticType:ReturnType<typeof createService>",
        type: "ALIAS_FOR",
      },
    ];

    const aliasMap = buildAliasMap(edges);

    expect(aliasMap.size).toBe(1);
    expect(aliasMap.get("ReturnType<typeof createService>")).toBe("Service");
  });

  it("ignores non-ALIAS_FOR edges", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/a.ts:Function:foo",
        target: "src/b.ts:Function:bar",
        type: "CALLS",
      },
    ];

    const aliasMap = buildAliasMap(edges);

    expect(aliasMap.size).toBe(0);
  });

  it("ignores ALIAS_FOR edges not targeting SyntheticType", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/a.ts:TypeAlias:Person",
        target: "src/b.ts:Interface:User",
        type: "ALIAS_FOR",
      },
    ];

    const aliasMap = buildAliasMap(edges);

    expect(aliasMap.size).toBe(0);
  });

  it("handles multiple aliases", () => {
    const edges: GraphEdge[] = [
      {
        source: "src/s.ts:TypeAlias:Service",
        target: "src/s.ts:SyntheticType:ReturnType<typeof createService>",
        type: "ALIAS_FOR",
      },
      {
        source: "src/r.ts:TypeAlias:Repo",
        target: "src/r.ts:SyntheticType:ReturnType<typeof createRepo>",
        type: "ALIAS_FOR",
      },
    ];

    const aliasMap = buildAliasMap(edges);

    expect(aliasMap.size).toBe(2);
    expect(aliasMap.get("ReturnType<typeof createService>")).toBe("Service");
    expect(aliasMap.get("ReturnType<typeof createRepo>")).toBe("Repo");
  });

  it("returns empty map when no edges", () => {
    const aliasMap = buildAliasMap([]);

    expect(aliasMap.size).toBe(0);
  });
});
