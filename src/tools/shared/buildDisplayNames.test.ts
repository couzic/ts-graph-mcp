import { describe, expect, it } from "vitest";
import { buildDisplayNames } from "./buildDisplayNames.js";

describe(buildDisplayNames.name, () => {
  it("uses symbol name when unique", () => {
    const names = buildDisplayNames(["src/a.ts:foo", "src/b.ts:bar"]);

    expect(names.get("src/a.ts:foo")).toBe("foo");
    expect(names.get("src/b.ts:bar")).toBe("bar");
  });

  it("adds #N suffix when names collide", () => {
    const names = buildDisplayNames([
      "src/a.ts:format",
      "src/b.ts:format",
      "src/c.ts:format",
    ]);

    expect(names.get("src/a.ts:format")).toBe("format#1");
    expect(names.get("src/b.ts:format")).toBe("format#2");
    expect(names.get("src/c.ts:format")).toBe("format#3");
  });

  it("handles method names with dots", () => {
    const names = buildDisplayNames([
      "src/a.ts:User.save",
      "src/b.ts:User.delete",
    ]);

    expect(names.get("src/a.ts:User.save")).toBe("User.save");
    expect(names.get("src/b.ts:User.delete")).toBe("User.delete");
  });
});
