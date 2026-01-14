import { describe, expect, it } from "vitest";
import { extractFilePath } from "./extractFilePath.js";

describe("extractFilePath", () => {
  it("extracts file path from node ID", () => {
    expect(extractFilePath("src/utils.ts:formatDate")).toBe("src/utils.ts");
  });

  it("handles method names", () => {
    expect(extractFilePath("src/models/User.ts:User.save")).toBe(
      "src/models/User.ts",
    );
  });

  it("returns input unchanged when no colon present", () => {
    expect(extractFilePath("unknown")).toBe("unknown");
  });

  it("handles empty string", () => {
    expect(extractFilePath("")).toBe("");
  });
});
