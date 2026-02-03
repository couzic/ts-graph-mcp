import { describe } from "node:test";
import { expect, it } from "vitest";
import { generateNodeId } from "./generateNodeId.js";

describe(generateNodeId.name, () => {
  it("formats as path:type:symbol", () => {
    expect(generateNodeId("src/utils.ts", "Function", "formatDate")).toBe(
      "src/utils.ts:Function:formatDate",
    );
    expect(generateNodeId("src/user.ts", "Method", "User.validate")).toBe(
      "src/user.ts:Method:User.validate",
    );
  });

  it("normalizes Windows paths", () => {
    expect(generateNodeId("src\\models\\user.ts", "Class", "User")).toBe(
      "src/models/user.ts:Class:User",
    );
  });
});
