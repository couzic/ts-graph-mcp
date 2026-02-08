import { describe, expect, it } from "vitest";
import { buildDisplayNames } from "./buildDisplayNames.js";

describe(buildDisplayNames.name, () => {
  it("uses symbol name when unique", () => {
    const names = buildDisplayNames([
      "src/a.ts:Function:foo",
      "src/b.ts:Function:bar",
    ]);

    expect(names.get("src/a.ts:Function:foo")).toBe("foo");
    expect(names.get("src/b.ts:Function:bar")).toBe("bar");
  });

  it("adds #N suffix when names collide", () => {
    const names = buildDisplayNames([
      "src/a.ts:Function:format",
      "src/b.ts:Function:format",
      "src/c.ts:Function:format",
    ]);

    expect(names.get("src/a.ts:Function:format")).toBe("format#1");
    expect(names.get("src/b.ts:Function:format")).toBe("format#2");
    expect(names.get("src/c.ts:Function:format")).toBe("format#3");
  });

  it("simplifies ReturnType<typeof X> when alias map is provided", () => {
    const aliasMap = new Map([["ReturnType<typeof createService>", "Service"]]);

    const names = buildDisplayNames(
      [
        "src/s.ts:Function:ReturnType<typeof createService>.doSomething",
        "src/s.ts:TypeAlias:Service",
      ],
      aliasMap,
    );

    expect(
      names.get(
        "src/s.ts:Function:ReturnType<typeof createService>.doSomething",
      ),
    ).toBe("Service.doSomething");
  });

  it("handles method names with dots", () => {
    const names = buildDisplayNames([
      "src/a.ts:Method:User.save",
      "src/b.ts:Method:User.delete",
    ]);

    expect(names.get("src/a.ts:Method:User.save")).toBe("User.save");
    expect(names.get("src/b.ts:Method:User.delete")).toBe("User.delete");
  });
});
