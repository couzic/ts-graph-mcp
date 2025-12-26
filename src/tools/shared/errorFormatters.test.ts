import { describe, expect, it } from "vitest";
import { formatAmbiguous, formatNotFound } from "./errorFormatters.js";
import type { SymbolLocation } from "./resolveSymbol.js";

describe.skip(formatNotFound.name, () => {
  it("formats basic not found error with example syntax", () => {
    const result = formatNotFound("formatDate");

    expect(result).toContain('Symbol "formatDate" not found');
    expect(result).toContain(
      "Narrow your query with file, module, or package:",
    );
    expect(result).toContain('{ symbol: "formatDate", file: "src/..." }');
    expect(result).toContain('{ symbol: "formatDate", module: "..." }');
  });

  it("includes suggestions when provided", () => {
    const result = formatNotFound("formatDat", ["formatDate", "formatTime"]);

    expect(result).toContain('Symbol "formatDat" not found');
    expect(result).toContain("Did you mean: formatDate, formatTime?");
    expect(result).toContain('{ symbol: "formatDat", file: "src/..." }');
  });

  it("uses label for multi-symbol queries", () => {
    const result = formatNotFound("save", undefined, "from.symbol");

    expect(result).toContain('from.symbol "save" not found');
    expect(result).toContain('{ symbol: "save", file: "src/..." }');
  });
});

describe.skip(formatAmbiguous.name, () => {
  const candidatesInDifferentFiles: SymbolLocation[] = [
    {
      name: "save",
      type: "Function",
      file: "src/utils.ts",
      offset: 10,
      limit: 5,
      module: "core",
      package: "main",
      id: "src/utils.ts:save",
    },
    {
      name: "save",
      type: "Method",
      file: "src/models/User.ts",
      offset: 20,
      limit: 8,
      module: "core",
      package: "main",
      id: "src/models/User.ts:User.save",
    },
  ];

  const candidatesInDifferentModules: SymbolLocation[] = [
    {
      name: "format",
      type: "Function",
      file: "src/utils/format.ts",
      offset: 1,
      limit: 10,
      module: "utils",
      package: "core",
      id: "src/utils/format.ts:format",
    },
    {
      name: "format",
      type: "Function",
      file: "src/formatters/format.ts",
      offset: 1,
      limit: 12,
      module: "formatters",
      package: "core",
      id: "src/formatters/format.ts:format",
    },
  ];

  const candidatesInDifferentPackages: SymbolLocation[] = [
    {
      name: "validate",
      type: "Function",
      file: "packages/core/validate.ts",
      offset: 5,
      limit: 15,
      module: "main",
      package: "core",
      id: "packages/core/validate.ts:validate",
    },
    {
      name: "validate",
      type: "Function",
      file: "packages/lib/validate.ts",
      offset: 5,
      limit: 20,
      module: "main",
      package: "lib",
      id: "packages/lib/validate.ts:validate",
    },
  ];

  it("lists all candidates with metadata", () => {
    const result = formatAmbiguous("save", candidatesInDifferentFiles);

    expect(result).toContain('Multiple matches for "save"');
    expect(result).toContain("candidates:");
    expect(result).toContain("save (Function) in src/utils.ts");
    expect(result).toContain("offset: 10, limit: 5");
    expect(result).toContain("module: core, package: main");
    expect(result).toContain("save (Method) in src/models/User.ts");
  });

  it("shows file example when candidates differ by file", () => {
    const result = formatAmbiguous("save", candidatesInDifferentFiles);

    expect(result).toContain(
      "Narrow your query with file, module, or package:",
    );
    expect(result).toContain('{ symbol: "save", file: "src/utils.ts" }');
  });

  it("shows module example when candidates differ by module", () => {
    const result = formatAmbiguous("format", candidatesInDifferentModules);

    expect(result).toContain('{ symbol: "format", module: "utils" }');
  });

  it("shows package example when candidates differ by package", () => {
    const result = formatAmbiguous("validate", candidatesInDifferentPackages);

    expect(result).toContain('{ symbol: "validate", package: "core" }');
  });

  it("shows multiple examples when candidates differ by multiple dimensions", () => {
    // These candidates differ in both file AND module
    const result = formatAmbiguous("format", candidatesInDifferentModules);

    // Should show both file and module examples
    expect(result).toContain('{ symbol: "format", file:');
    expect(result).toContain('{ symbol: "format", module:');
  });

  it("shows fallback file example when all candidates share same file/module/package", () => {
    const sameLocation: SymbolLocation[] = [
      {
        name: "helper",
        type: "Function",
        file: "src/utils.ts",
        offset: 10,
        limit: 5,
        module: "core",
        package: "main",
        id: "src/utils.ts:helper",
      },
      {
        name: "helper",
        type: "Variable",
        file: "src/utils.ts",
        offset: 30,
        limit: 1,
        module: "core",
        package: "main",
        id: "src/utils.ts:helper",
      },
    ];

    const result = formatAmbiguous("helper", sameLocation);

    // Should still show at least one example (file as fallback)
    expect(result).toContain('{ symbol: "helper", file: "src/utils.ts" }');
  });

  it("uses label for multi-symbol queries", () => {
    const result = formatAmbiguous(
      "save",
      candidatesInDifferentFiles,
      "to.symbol",
    );

    expect(result).toContain('Multiple matches for to.symbol "save"');
  });

  it("limits examples to 3 maximum", () => {
    // Create candidates that differ in all three dimensions
    const allDifferent: SymbolLocation[] = [
      {
        name: "x",
        type: "Function",
        file: "a.ts",
        offset: 1,
        limit: 1,
        module: "m1",
        package: "p1",
        id: "a.ts:x",
      },
      {
        name: "x",
        type: "Function",
        file: "b.ts",
        offset: 1,
        limit: 1,
        module: "m2",
        package: "p2",
        id: "b.ts:x",
      },
    ];

    const result = formatAmbiguous("x", allDifferent);

    // Count example lines (lines starting with "  {")
    const exampleLines = result
      .split("\n")
      .filter((line) => line.startsWith("  {"));
    expect(exampleLines.length).toBeLessThanOrEqual(3);
  });
});
