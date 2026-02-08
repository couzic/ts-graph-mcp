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

  it("disambiguates by filename when same type clashes across files", () => {
    const names = buildDisplayNames([
      "src/a.ts:Function:format",
      "src/b.ts:Function:format",
      "src/c.ts:Function:format",
    ]);

    expect(names.get("src/a.ts:Function:format")).toBe("format (a.ts)");
    expect(names.get("src/b.ts:Function:format")).toBe("format (b.ts)");
    expect(names.get("src/c.ts:Function:format")).toBe("format (c.ts)");
  });

  it("disambiguates by type when same name clashes in same file", () => {
    const names = buildDisplayNames([
      "src/user.ts:Class:User",
      "src/user.ts:Interface:User",
    ]);

    expect(names.get("src/user.ts:Class:User")).toBe("User (Class)");
    expect(names.get("src/user.ts:Interface:User")).toBe("User (Interface)");
  });

  it("disambiguates by path segments when filenames also clash", () => {
    const names = buildDisplayNames([
      "src/v1/api.ts:Function:handle",
      "src/v2/api.ts:Function:handle",
    ]);

    expect(names.get("src/v1/api.ts:Function:handle")).toBe(
      "handle (v1/api.ts)",
    );
    expect(names.get("src/v2/api.ts:Function:handle")).toBe(
      "handle (v2/api.ts)",
    );
  });

  it("disambiguates by type when both type and file differ", () => {
    const names = buildDisplayNames([
      "src/a.ts:Class:User",
      "src/b.ts:Interface:User",
    ]);

    expect(names.get("src/a.ts:Class:User")).toBe("User (Class)");
    expect(names.get("src/b.ts:Interface:User")).toBe("User (Interface)");
  });

  it("disambiguates by both type and filename when both axes clash", () => {
    const names = buildDisplayNames([
      "src/a.ts:Class:User",
      "src/a.ts:Interface:User",
      "src/b.ts:Class:User",
    ]);

    expect(names.get("src/a.ts:Class:User")).toBe("User (Class, a.ts)");
    expect(names.get("src/a.ts:Interface:User")).toBe("User (Interface, a.ts)");
    expect(names.get("src/b.ts:Class:User")).toBe("User (Class, b.ts)");
  });

  it("only disambiguates colliding names, leaves unique names plain", () => {
    const names = buildDisplayNames([
      "src/a.ts:Function:format",
      "src/b.ts:Function:format",
      "src/c.ts:Function:validate",
    ]);

    expect(names.get("src/a.ts:Function:format")).toBe("format (a.ts)");
    expect(names.get("src/b.ts:Function:format")).toBe("format (b.ts)");
    expect(names.get("src/c.ts:Function:validate")).toBe("validate");
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
