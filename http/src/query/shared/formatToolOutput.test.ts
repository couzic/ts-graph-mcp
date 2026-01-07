import { describe, expect, it } from "vitest";
import type { FormatInput } from "./formatToolOutput.js";
import { formatToolOutput } from "./formatToolOutput.js";

describe("formatToolOutput", () => {
  it("formats a simple call chain with node snippets", () => {
    const input: FormatInput = {
      edges: [
        {
          source: "src/a.ts:fnA",
          target: "src/b.ts:fnB",
          type: "CALLS",
        },
        {
          source: "src/b.ts:fnB",
          target: "src/c.ts:fnC",
          type: "CALLS",
          callSites: [{ start: 2, end: 2 }],
        },
      ],
      nodes: [
        {
          id: "src/b.ts:fnB",
          name: "fnB",
          filePath: "src/b.ts",
          startLine: 1,
          endLine: 3,
          locs: [
            { line: 1, code: "function fnB() {" },
            { line: 2, code: "  return fnC();" },
            { line: 3, code: "}" },
          ],
        },
      ],
      excludeNodeIds: new Set(["src/a.ts:fnA", "src/c.ts:fnC"]),
    };

    const result = formatToolOutput(input);

    expect(result).toBe(`## Graph

fnA --CALLS--> fnB --CALLS--> fnC

## Nodes

fnB:
  file: src/b.ts
  offset: 1, limit: 3
  snippet:
    1: function fnB() {
  > 2:   return fnC();
    3: }
`);
  });

  it("supports empty nodes", () => {
    const input: FormatInput = {
      edges: [
        { source: "src/a.ts:fnA", target: "src/b.ts:fnB", type: "CALLS" },
      ],
      nodes: [],
      excludeNodeIds: new Set(["src/a.ts:fnA", "src/b.ts:fnB"]),
    };

    const result = formatToolOutput(input);

    expect(result).toBe(`## Graph

fnA --CALLS--> fnB`);
  });
});
