import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeSchema } from "../../db/sqlite/sqliteSchema.utils.js";
import { resolveSymbol } from "./resolveSymbol.js";
import type { SymbolQuery } from "./SymbolQuery.js";

describe.skip(resolveSymbol.name, () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it("returns unique match for simple function name", () => {
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/utils.ts:formatDate",
      "Function",
      "formatDate",
      "main",
      "core",
      "src/utils.ts",
      10,
      15,
      1,
    );

    const query: SymbolQuery = { symbol: "formatDate" };
    const result = resolveSymbol(db, query);

    expect(result).toEqual({
      status: "unique",
      node: {
        name: "formatDate",
        type: "Function",
        file: "src/utils.ts",
        offset: 10,
        limit: 6, // 15 - 10 + 1
        module: "main",
        package: "core",
        id: "src/utils.ts:formatDate",
      },
    });
  });

  it("returns ambiguous when multiple functions match", () => {
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/utils.ts:format",
      "Function",
      "format",
      "utils",
      "core",
      "src/utils.ts",
      1,
      10,
      1,
    );
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/formatters.ts:format",
      "Function",
      "format",
      "formatters",
      "core",
      "src/formatters.ts",
      20,
      30,
      1,
    );

    const query: SymbolQuery = { symbol: "format" };
    const result = resolveSymbol(db, query);

    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0]?.name).toBe("format");
      expect(result.candidates[1]?.name).toBe("format");
      expect(result.candidates[0]?.file).toBe("src/utils.ts");
      expect(result.candidates[1]?.file).toBe("src/formatters.ts");
    }
  });

  it("resolves qualified method name (User.save)", () => {
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/models/User.ts:User.save",
      "Method",
      "save",
      "models",
      "core",
      "src/models/User.ts",
      50,
      60,
      0,
    );
    // Add another "save" method to ensure qualified name resolves correctly
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/models/Post.ts:Post.save",
      "Method",
      "save",
      "models",
      "core",
      "src/models/Post.ts",
      40,
      50,
      0,
    );

    const query: SymbolQuery = { symbol: "User.save" };
    const result = resolveSymbol(db, query);

    expect(result).toEqual({
      status: "unique",
      node: {
        name: "save",
        type: "Method",
        file: "src/models/User.ts",
        offset: 50,
        limit: 11, // 60 - 50 + 1
        module: "models",
        package: "core",
        id: "src/models/User.ts:User.save",
      },
    });
  });

  it("narrows results with file filter", () => {
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/utils.ts:format",
      "Function",
      "format",
      "utils",
      "core",
      "src/utils.ts",
      1,
      10,
      1,
    );
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/formatters.ts:format",
      "Function",
      "format",
      "formatters",
      "core",
      "src/formatters.ts",
      20,
      30,
      1,
    );

    const query: SymbolQuery = { symbol: "format", file: "src/utils.ts" };
    const result = resolveSymbol(db, query);

    expect(result).toEqual({
      status: "unique",
      node: {
        name: "format",
        type: "Function",
        file: "src/utils.ts",
        offset: 1,
        limit: 10,
        module: "utils",
        package: "core",
        id: "src/utils.ts:format",
      },
    });
  });

  it("narrows results with module filter", () => {
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/utils.ts:format",
      "Function",
      "format",
      "utils",
      "core",
      "src/utils.ts",
      1,
      10,
      1,
    );
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/formatters.ts:format",
      "Function",
      "format",
      "formatters",
      "core",
      "src/formatters.ts",
      20,
      30,
      1,
    );

    const query: SymbolQuery = { symbol: "format", module: "formatters" };
    const result = resolveSymbol(db, query);

    expect(result).toEqual({
      status: "unique",
      node: {
        name: "format",
        type: "Function",
        file: "src/formatters.ts",
        offset: 20,
        limit: 11,
        module: "formatters",
        package: "core",
        id: "src/formatters.ts:format",
      },
    });
  });

  it("narrows results with package filter", () => {
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/utils.ts:format",
      "Function",
      "format",
      "utils",
      "core",
      "src/utils.ts",
      1,
      10,
      1,
    );
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "lib/formatters.ts:format",
      "Function",
      "format",
      "formatters",
      "lib",
      "lib/formatters.ts",
      20,
      30,
      1,
    );

    const query: SymbolQuery = { symbol: "format", package: "lib" };
    const result = resolveSymbol(db, query);

    expect(result).toEqual({
      status: "unique",
      node: {
        name: "format",
        type: "Function",
        file: "lib/formatters.ts",
        offset: 20,
        limit: 11,
        module: "formatters",
        package: "lib",
        id: "lib/formatters.ts:format",
      },
    });
  });

  it("returns not_found with suggestions for fuzzy match", () => {
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/utils.ts:formatDate",
      "Function",
      "formatDate",
      "main",
      "core",
      "src/utils.ts",
      1,
      10,
      1,
    );
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/utils.ts:formatTime",
      "Function",
      "formatTime",
      "main",
      "core",
      "src/utils.ts",
      20,
      30,
      1,
    );

    const query: SymbolQuery = { symbol: "format" }; // partial match
    const result = resolveSymbol(db, query);

    expect(result.status).toBe("not_found");
    if (result.status === "not_found") {
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions).toEqual(
        expect.arrayContaining(["formatDate", "formatTime"]),
      );
    }
  });

  it("returns not_found without suggestions when no fuzzy match", () => {
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/utils.ts:formatDate",
      "Function",
      "formatDate",
      "main",
      "core",
      "src/utils.ts",
      1,
      10,
      1,
    );

    const query: SymbolQuery = { symbol: "nonexistent" };
    const result = resolveSymbol(db, query);

    expect(result).toEqual({
      status: "not_found",
    });
  });

  it("resolves namespace member (Utils.format)", () => {
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/utils/helpers.ts:Utils.format",
      "Function",
      "format",
      "utils",
      "core",
      "src/utils/helpers.ts",
      30,
      40,
      1,
    );
    // Add another format to ensure qualified name resolves correctly
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/formatters.ts:format",
      "Function",
      "format",
      "formatters",
      "core",
      "src/formatters.ts",
      20,
      30,
      1,
    );

    const query: SymbolQuery = { symbol: "Utils.format" };
    const result = resolveSymbol(db, query);

    expect(result).toEqual({
      status: "unique",
      node: {
        name: "format",
        type: "Function",
        file: "src/utils/helpers.ts",
        offset: 30,
        limit: 11,
        module: "utils",
        package: "core",
        id: "src/utils/helpers.ts:Utils.format",
      },
    });
  });

  it("combines multiple filters to resolve ambiguity", () => {
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/utils.ts:save",
      "Function",
      "save",
      "utils",
      "core",
      "src/utils.ts",
      1,
      10,
      1,
    );
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "src/models/User.ts:save",
      "Function",
      "save",
      "models",
      "core",
      "src/models/User.ts",
      20,
      30,
      1,
    );
    db.prepare(
      "INSERT INTO nodes (id, type, name, module, package, file_path, start_line, end_line, exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "lib/storage.ts:save",
      "Function",
      "save",
      "storage",
      "lib",
      "lib/storage.ts",
      40,
      50,
      1,
    );

    const query: SymbolQuery = {
      symbol: "save",
      module: "models",
      package: "core",
    };
    const result = resolveSymbol(db, query);

    expect(result).toEqual({
      status: "unique",
      node: {
        name: "save",
        type: "Function",
        file: "src/models/User.ts",
        offset: 20,
        limit: 11,
        module: "models",
        package: "core",
        id: "src/models/User.ts:save",
      },
    });
  });

  it("returns not_found without suggestions on empty database", () => {
    // Database has no nodes - verify fresh state
    const nodeCount = db
      .prepare("SELECT COUNT(*) as count FROM nodes")
      .get() as {
      count: number;
    };
    expect(nodeCount.count).toBe(0);

    const query: SymbolQuery = { symbol: "anySymbol" };
    const result = resolveSymbol(db, query);

    expect(result).toEqual({
      status: "not_found",
    });
  });
});
