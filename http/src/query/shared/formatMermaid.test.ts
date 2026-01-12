import { describe, expect, it } from "vitest";
import { formatMermaid } from "./formatMermaid.js";
import type { GraphEdge } from "./GraphTypes.js";

describe("formatMermaid", () => {
  it("returns empty state for no edges", () => {
    const result = formatMermaid([]);

    const expected = `graph LR
  empty[No data]`;

    expect(result).toBe(expected);
  });

  it("formats a single edge", () => {
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

  it("formats multiple edges in a chain", () => {
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

  it("formats different edge types", () => {
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

  it("handles method names with dot notation", () => {
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
});
