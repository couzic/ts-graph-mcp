import { describe, expect, it } from "vitest";
import { toPathPrefix } from "./toPathPrefix.js";

describe("toPathPrefix", () => {
  it("adds trailing slash to path without one", () => {
    expect(toPathPrefix("/home/user/project/libs/ui")).toBe(
      "/home/user/project/libs/ui/",
    );
  });

  it("keeps existing trailing slash", () => {
    expect(toPathPrefix("/home/user/project/libs/ui/")).toBe(
      "/home/user/project/libs/ui/",
    );
  });

  it("normalizes Windows backslashes to forward slashes", () => {
    // On Windows, dirname() returns backslashes (e.g., "C:\project\libs\ui").
    // getProjectForFile normalizes query paths to forward slashes.
    // The stored prefix must also be normalized for startsWith to work.
    expect(toPathPrefix("C:\\project\\libs\\ui")).toBe("C:/project/libs/ui/");
  });

  it("handles mixed separators", () => {
    expect(toPathPrefix("C:\\project/libs\\ui")).toBe("C:/project/libs/ui/");
  });
});
