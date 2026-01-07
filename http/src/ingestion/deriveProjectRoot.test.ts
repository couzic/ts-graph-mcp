import { describe, expect, it } from "vitest";
import { deriveProjectRoot } from "./deriveProjectRoot.js";

describe(deriveProjectRoot.name, () => {
  it("extracts project root from matching paths", () => {
    const result = deriveProjectRoot(
      "/home/user/project/src/file.ts",
      "src/file.ts",
    );
    expect(result).toBe("/home/user/project/");
  });

  it("handles deeply nested paths", () => {
    const result = deriveProjectRoot(
      "/home/user/project/libs/ui/src/components/Button.ts",
      "libs/ui/src/components/Button.ts",
    );
    expect(result).toBe("/home/user/project/");
  });

  it("handles Windows-style paths (after normalization)", () => {
    const result = deriveProjectRoot(
      "C:/Users/dev/project/src/utils.ts",
      "src/utils.ts",
    );
    expect(result).toBe("C:/Users/dev/project/");
  });

  it("returns empty string when paths do not match", () => {
    const result = deriveProjectRoot(
      "/home/user/other-project/src/file.ts",
      "src/different-file.ts",
    );
    expect(result).toBe("");
  });

  it("returns empty string for completely unrelated paths", () => {
    const result = deriveProjectRoot("/home/user/project/file.ts", "other.ts");
    expect(result).toBe("");
  });

  it("handles root-level files", () => {
    const result = deriveProjectRoot("/home/user/project/index.ts", "index.ts");
    expect(result).toBe("/home/user/project/");
  });
});
