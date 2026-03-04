import { describe, expect, it } from "vitest";
import { groupNodesBySubgraph } from "./groupNodesBySubgraph.js";
import type { NodeMetadata } from "./queryNodeMetadata.js";

/** @spec tool::output.mermaid-subgraphs */
describe(groupNodesBySubgraph.name, () => {
  describe("file grouping (no metadata)", () => {
    it("groups nodes from same file together", () => {
      const nodeIds = new Set([
        "src/a.ts:Function:fnA",
        "src/a.ts:Function:fnB",
      ]);

      const result = groupNodesBySubgraph(nodeIds);

      expect(result.size).toBe(1);
      expect(result.get("src/a.ts")).toEqual([
        "src/a.ts:Function:fnA",
        "src/a.ts:Function:fnB",
      ]);
    });

    it("separates nodes from different files", () => {
      const nodeIds = new Set([
        "src/a.ts:Function:fnA",
        "src/b.ts:Function:fnB",
      ]);

      const result = groupNodesBySubgraph(nodeIds);

      expect(result.size).toBe(2);
      expect(result.get("src/a.ts")).toEqual(["src/a.ts:Function:fnA"]);
      expect(result.get("src/b.ts")).toEqual(["src/b.ts:Function:fnB"]);
    });

    it("handles mixed: some files with multiple symbols, some with one", () => {
      const nodeIds = new Set([
        "src/a.ts:Function:fnA",
        "src/a.ts:Function:fnB",
        "src/b.ts:Function:fnC",
      ]);

      const result = groupNodesBySubgraph(nodeIds);

      expect(result.size).toBe(2);
      expect(result.get("src/a.ts")).toHaveLength(2);
      expect(result.get("src/b.ts")).toHaveLength(1);
    });

    it("groups three files correctly", () => {
      const nodeIds = new Set([
        "src/a.ts:Function:fnA",
        "src/a.ts:Function:fnB",
        "src/b.ts:Function:fnC",
        "src/b.ts:Function:fnD",
        "src/c.ts:Function:fnE",
      ]);

      const result = groupNodesBySubgraph(nodeIds);

      expect(result.size).toBe(3);
      expect(result.get("src/a.ts")).toHaveLength(2);
      expect(result.get("src/b.ts")).toHaveLength(2);
      expect(result.get("src/c.ts")).toHaveLength(1);
    });
  });

  describe("file grouping (single package metadata)", () => {
    it("falls back to file grouping when all nodes share same package", () => {
      const nodeIds = new Set([
        "src/a.ts:Function:fnA",
        "src/a.ts:Function:fnB",
        "src/b.ts:Function:fnC",
      ]);
      const metadata = new Map<string, NodeMetadata>([
        ["src/a.ts:Function:fnA", { package: "http", type: "Function" }],
        ["src/a.ts:Function:fnB", { package: "http", type: "Function" }],
        ["src/b.ts:Function:fnC", { package: "http", type: "Function" }],
      ]);

      const result = groupNodesBySubgraph(nodeIds, metadata);

      expect(result.size).toBe(2);
      expect(result.get("src/a.ts")).toHaveLength(2);
      expect(result.get("src/b.ts")).toHaveLength(1);
    });
  });

  describe("package grouping (multiple packages)", () => {
    it("groups nodes by package when multiple packages exist", () => {
      const nodeIds = new Set([
        "http/api.ts:Function:handler",
        "http/service.ts:Function:process",
        "shared/utils.ts:Function:format",
      ]);
      const metadata = new Map<string, NodeMetadata>([
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

      const result = groupNodesBySubgraph(nodeIds, metadata);

      expect(result.size).toBe(2);
      expect(result.get("http")).toEqual([
        "http/api.ts:Function:handler",
        "http/service.ts:Function:process",
      ]);
      expect(result.get("shared")).toEqual(["shared/utils.ts:Function:format"]);
    });

    it("falls back to file path for nodes missing metadata", () => {
      const nodeIds = new Set([
        "http/api.ts:Function:handler",
        "shared/utils.ts:Function:format",
        "shared/types.ts:SyntheticType:SomeType",
      ]);
      const metadata = new Map<string, NodeMetadata>([
        ["http/api.ts:Function:handler", { package: "http", type: "Function" }],
        [
          "shared/utils.ts:Function:format",
          { package: "shared", type: "Function" },
        ],
        // SomeType has no metadata
      ]);

      const result = groupNodesBySubgraph(nodeIds, metadata);

      // SomeType should be in the "shared" group (same package), but since
      // it has no metadata, it falls back to file path "shared/types.ts"
      // This creates an inconsistent group: package names mixed with file paths
      expect(result.has("shared/types.ts")).toBe(true);
      expect(result.get("shared")).toEqual(["shared/utils.ts:Function:format"]);
    });

    it("groups three packages correctly", () => {
      const nodeIds = new Set([
        "http/api.ts:Function:handler",
        "shared/utils.ts:Function:format",
        "shared/helpers.ts:Function:helper",
        "mcp/wrapper.ts:Function:wrap",
      ]);
      const metadata = new Map<string, NodeMetadata>([
        ["http/api.ts:Function:handler", { package: "http", type: "Function" }],
        [
          "shared/utils.ts:Function:format",
          { package: "shared", type: "Function" },
        ],
        [
          "shared/helpers.ts:Function:helper",
          { package: "shared", type: "Function" },
        ],
        ["mcp/wrapper.ts:Function:wrap", { package: "mcp", type: "Function" }],
      ]);

      const result = groupNodesBySubgraph(nodeIds, metadata);

      expect(result.size).toBe(3);
      expect(result.get("http")).toHaveLength(1);
      expect(result.get("shared")).toHaveLength(2);
      expect(result.get("mcp")).toHaveLength(1);
    });
  });
});
