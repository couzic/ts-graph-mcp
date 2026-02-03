import { describe, expect, it } from "vitest";
import { parseEdgeRows } from "./parseEdgeRows.js";

describe(parseEdgeRows.name, () => {
  it("parses call_sites JSON and handles nulls", () => {
    const rows = [
      {
        source: "src/a.ts:Function:fnA",
        target: "src/b.ts:Function:fnB",
        type: "CALLS",
        call_sites: JSON.stringify([{ start: 5, end: 5 }]),
      },
      {
        source: "src/b.ts:Function:fnB",
        target: "src/c.ts:Function:fnC",
        type: "REFERENCES",
        call_sites: null,
      },
    ];

    const result = parseEdgeRows(rows);

    expect(result).toEqual([
      {
        source: "src/a.ts:Function:fnA",
        target: "src/b.ts:Function:fnB",
        type: "CALLS",
        callSites: [{ start: 5, end: 5 }],
      },
      {
        source: "src/b.ts:Function:fnB",
        target: "src/c.ts:Function:fnC",
        type: "REFERENCES",
        callSites: undefined,
      },
    ]);
  });
});
