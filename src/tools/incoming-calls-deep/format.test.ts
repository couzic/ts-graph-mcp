import { describe, expect, it } from "vitest";
import type { Node } from "../../db/Types.js";
import {
  IMPLICIT_MODULE_NAME,
  IMPLICIT_PACKAGE_NAME,
} from "../shared/nodeFormatters.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatCallers, formatCallersWithSnippets } from "./format.js";

// Helper to create a test SymbolLocation
function createTarget(
  nodeId: string,
  name = "formatDate",
  type = "Function",
): SymbolLocation {
  const file = nodeId.split(":")[0] ?? "src/test.ts";
  return {
    name,
    type,
    file,
    offset: 15,
    limit: 6,
    module: "test",
    package: "main",
    id: nodeId,
  };
}

describe.skip(formatCallers.name, () => {
  it("formats empty caller list", () => {
    const target: SymbolLocation = {
      name: "formatDate",
      type: "Function",
      file: "src/utils.ts",
      offset: 15,
      limit: 6,
      module: "utils",
      package: "main",
      id: "src/utils.ts:formatDate",
    };
    const result = formatCallers(target, []);
    expect(result).toContain("target:");
    expect(result).toContain("name: formatDate");
    expect(result).toContain("file: src/utils.ts");
    expect(result).toContain("callers[0]:");
    expect(result).toContain("(no callers found)");
  });

  it("formats single caller function", () => {
    const target: SymbolLocation = {
      name: "formatDate",
      type: "Function",
      file: "src/utils.ts",
      offset: 15,
      limit: 6,
      module: "utils",
      package: "main",
      id: "src/utils.ts:formatDate",
    };
    const nodes: Node[] = [
      {
        id: "src/api/handler.ts:handleRequest",
        type: "Function",
        name: "handleRequest",
        module: "my-module",
        package: "my-package",
        filePath: "src/api/handler.ts",
        startLine: 10,
        endLine: 25,
        exported: true,
        async: true,
        parameters: [{ name: "req", type: "Request" }],
        returnType: "Promise<Response>",
      },
    ];

    const result = formatCallers(target, nodes);
    expect(result).toContain("target:");
    expect(result).toContain("name: formatDate");
    expect(result).toContain("callers[1]:");
    expect(result).toContain("src/api/handler.ts (1 callers):");
    expect(result).toContain("functions[1]:");
    expect(result).toContain(
      "handleRequest [10-25] exp async (req:Request) → Promise<Response>",
    );
    expect(result).toContain("offset: 10, limit: 16");
  });

  it("groups callers by file", () => {
    const nodes: Node[] = [
      {
        id: "src/api/handler.ts:handleRequest",
        type: "Function",
        name: "handleRequest",
        module: "api",
        package: "main",
        filePath: "src/api/handler.ts",
        startLine: 10,
        endLine: 15,
        exported: true,
      },
      {
        id: "src/services/UserService.ts:createUser",
        type: "Function",
        name: "createUser",
        module: "services",
        package: "main",
        filePath: "src/services/UserService.ts",
        startLine: 20,
        endLine: 30,
        exported: false,
      },
    ];

    const result = formatCallers(
      createTarget("src/db/user.ts:saveUser", "saveUser"),
      nodes,
    );
    expect(result).toContain("src/api/handler.ts (1 callers):");
    expect(result).toContain("src/services/UserService.ts (1 callers):");
  });

  it("groups callers by type within file", () => {
    const nodes: Node[] = [
      {
        id: "src/api/handler.ts:handleRequest",
        type: "Function",
        name: "handleRequest",
        module: "api",
        package: "main",
        filePath: "src/api/handler.ts",
        startLine: 10,
        endLine: 15,
        exported: true,
      },
      {
        id: "src/api/handler.ts:ApiClient.fetch",
        type: "Method",
        name: "fetch",
        module: "api",
        package: "main",
        filePath: "src/api/handler.ts",
        startLine: 40,
        endLine: 50,
        exported: false,
        visibility: "private",
        async: true,
      },
      {
        id: "src/api/handler.ts:validateInput",
        type: "Function",
        name: "validateInput",
        module: "api",
        package: "main",
        filePath: "src/api/handler.ts",
        startLine: 30,
        endLine: 35,
        exported: false,
      },
    ];

    const result = formatCallers(
      createTarget("src/utils.ts:formatDate"),
      nodes,
    );
    expect(result).toContain("src/api/handler.ts (3 callers):");
    expect(result).toContain("functions[2]:");
    expect(result).toContain("methods[1]:");

    // Functions should appear before methods
    const functionsIndex = result.indexOf("functions[2]:");
    const methodsIndex = result.indexOf("methods[1]:");
    expect(functionsIndex).toBeLessThan(methodsIndex);
  });

  it("formats method callers with visibility and static", () => {
    const nodes: Node[] = [
      {
        id: "src/user.ts:User.save",
        type: "Method",
        name: "save",
        module: "user",
        package: "main",
        filePath: "src/user.ts",
        startLine: 20,
        endLine: 25,
        exported: false,
        visibility: "private",
        static: true,
        async: true,
        parameters: [],
        returnType: "Promise<void>",
      },
    ];

    const result = formatCallers(
      createTarget("src/db/user.ts:saveUser", "saveUser"),
      nodes,
    );
    expect(result).toContain("methods[1]:");
    expect(result).toContain(
      "User.save [20-25] private static async () → Promise<void>",
    );
  });

  it("sorts files alphabetically", () => {
    const nodes: Node[] = [
      {
        id: "src/z.ts:funcZ",
        type: "Function",
        name: "funcZ",
        module: "test",
        package: "main",
        filePath: "src/z.ts",
        startLine: 1,
        endLine: 5,
        exported: false,
      },
      {
        id: "src/a.ts:funcA",
        type: "Function",
        name: "funcA",
        module: "test",
        package: "main",
        filePath: "src/a.ts",
        startLine: 1,
        endLine: 5,
        exported: false,
      },
    ];

    const result = formatCallers(
      createTarget("src/target.ts:myFunc", "myFunc"),
      nodes,
    );
    const aIndex = result.indexOf("src/a.ts");
    const zIndex = result.indexOf("src/z.ts");
    expect(aIndex).toBeLessThan(zIndex);
  });

  it("uses single line number when start equals end", () => {
    const nodes: Node[] = [
      {
        id: "src/test.ts:x",
        type: "Variable",
        name: "x",
        module: "test",
        package: "main",
        filePath: "src/test.ts",
        startLine: 5,
        endLine: 5,
        exported: false,
      },
    ];

    const result = formatCallers(
      createTarget("src/target.ts:myFunc", "myFunc"),
      nodes,
    );
    expect(result).toContain("x [5]");
    expect(result).not.toContain("5-5");
  });

  it("formats function parameters and return type", () => {
    const nodes: Node[] = [
      {
        id: "src/api.ts:makeRequest",
        type: "Function",
        name: "makeRequest",
        module: "api",
        package: "main",
        filePath: "src/api.ts",
        startLine: 10,
        endLine: 20,
        exported: true,
        async: false,
        parameters: [
          { name: "url", type: "string" },
          { name: "options", type: "RequestOptions" },
        ],
        returnType: "Response",
      },
    ];

    const result = formatCallers(
      createTarget("src/http.ts:fetch", "fetch"),
      nodes,
    );
    expect(result).toContain(
      "makeRequest [10-20] exp (url:string,options:RequestOptions) → Response",
    );
  });

  it("handles multiple callers per file with correct counts", () => {
    const nodes: Node[] = [
      {
        id: "src/file.ts:func1",
        type: "Function",
        name: "func1",
        module: "test",
        package: "main",
        filePath: "src/file.ts",
        startLine: 1,
        endLine: 5,
        exported: false,
      },
      {
        id: "src/file.ts:func2",
        type: "Function",
        name: "func2",
        module: "test",
        package: "main",
        filePath: "src/file.ts",
        startLine: 10,
        endLine: 15,
        exported: false,
      },
      {
        id: "src/file.ts:Class.method",
        type: "Method",
        name: "method",
        module: "test",
        package: "main",
        filePath: "src/file.ts",
        startLine: 20,
        endLine: 25,
        exported: false,
      },
    ];

    const result = formatCallers(
      createTarget("src/target.ts:myFunc", "myFunc"),
      nodes,
    );
    expect(result).toContain("callers[3]:");
    expect(result).toContain("src/file.ts (3 callers):");
    expect(result).toContain("functions[2]:");
    expect(result).toContain("methods[1]:");
  });

  describe("module/package omission", () => {
    it("omits module when IMPLICIT_MODULE_NAME", () => {
      const target: SymbolLocation = {
        name: "formatDate",
        type: "Function",
        file: "src/utils.ts",
        offset: 15,
        limit: 6,
        module: IMPLICIT_MODULE_NAME,
        package: "main",
        id: "src/utils.ts:formatDate",
      };
      const nodes: Node[] = [
        {
          id: "src/api/handler.ts:handleRequest",
          type: "Function",
          name: "handleRequest",
          module: "backend",
          package: "api",
          filePath: "src/api/handler.ts",
          startLine: 10,
          endLine: 15,
          exported: true,
        },
      ];

      const result = formatCallers(target, nodes);
      expect(result).not.toContain("module:");
      expect(result).toContain("package: main");
    });

    it("includes module when value is not 'default'", () => {
      const target: SymbolLocation = {
        name: "formatDate",
        type: "Function",
        file: "src/utils.ts",
        offset: 15,
        limit: 6,
        module: "myModule",
        package: "main",
        id: "src/utils.ts:formatDate",
      };
      const nodes: Node[] = [
        {
          id: "src/api/handler.ts:handleRequest",
          type: "Function",
          name: "handleRequest",
          module: "backend",
          package: "api",
          filePath: "src/api/handler.ts",
          startLine: 10,
          endLine: 15,
          exported: true,
        },
      ];

      const result = formatCallers(target, nodes);
      expect(result).toContain("module: myModule");
    });

    it("omits package when IMPLICIT_PACKAGE_NAME", () => {
      const target: SymbolLocation = {
        name: "formatDate",
        type: "Function",
        file: "src/utils.ts",
        offset: 15,
        limit: 6,
        module: "core",
        package: IMPLICIT_PACKAGE_NAME,
        id: "src/utils.ts:formatDate",
      };
      const nodes: Node[] = [
        {
          id: "src/api/handler.ts:handleRequest",
          type: "Function",
          name: "handleRequest",
          module: "backend",
          package: "api",
          filePath: "src/api/handler.ts",
          startLine: 10,
          endLine: 15,
          exported: true,
        },
      ];

      const result = formatCallers(target, nodes);
      expect(result).toContain("module: core");
      expect(result).not.toContain("package:");
    });

    it("includes package when value is not 'default'", () => {
      const target: SymbolLocation = {
        name: "formatDate",
        type: "Function",
        file: "src/utils.ts",
        offset: 15,
        limit: 6,
        module: "core",
        package: "myPackage",
        id: "src/utils.ts:formatDate",
      };
      const nodes: Node[] = [
        {
          id: "src/api/handler.ts:handleRequest",
          type: "Function",
          name: "handleRequest",
          module: "backend",
          package: "api",
          filePath: "src/api/handler.ts",
          startLine: 10,
          endLine: 15,
          exported: true,
        },
      ];

      const result = formatCallers(target, nodes);
      expect(result).toContain("package: myPackage");
    });

    it("omits both module and package when both are IMPLICIT values", () => {
      const target: SymbolLocation = {
        name: "formatDate",
        type: "Function",
        file: "src/utils.ts",
        offset: 15,
        limit: 6,
        module: IMPLICIT_MODULE_NAME,
        package: IMPLICIT_PACKAGE_NAME,
        id: "src/utils.ts:formatDate",
      };
      const nodes: Node[] = [
        {
          id: "src/api/handler.ts:handleRequest",
          type: "Function",
          name: "handleRequest",
          module: "backend",
          package: "api",
          filePath: "src/api/handler.ts",
          startLine: 10,
          endLine: 15,
          exported: true,
        },
      ];

      const result = formatCallers(target, nodes);
      expect(result).not.toContain("module:");
      expect(result).not.toContain("package:");
      expect(result).toContain("target:");
      expect(result).toContain("name: formatDate");
    });
  });

  describe("snippetsOmitted option", () => {
    it("shows omission message when snippetsOmitted is true", () => {
      const target: SymbolLocation = {
        name: "formatDate",
        type: "Function",
        file: "src/utils.ts",
        offset: 15,
        limit: 6,
        module: "utils",
        package: "main",
        id: "src/utils.ts:formatDate",
      };
      const nodes: Node[] = [
        {
          id: "src/api/handler.ts:handleRequest",
          type: "Function",
          name: "handleRequest",
          module: "api",
          package: "main",
          filePath: "src/api/handler.ts",
          startLine: 10,
          endLine: 15,
          exported: true,
        },
      ];

      const result = formatCallers(target, nodes, { snippetsOmitted: true });
      expect(result).toContain("callers[1]:");
      expect(result).toContain("(snippets omitted due to high caller count)");
    });

    it("does not show omission message when snippetsOmitted is false", () => {
      const target: SymbolLocation = {
        name: "formatDate",
        type: "Function",
        file: "src/utils.ts",
        offset: 15,
        limit: 6,
        module: "utils",
        package: "main",
        id: "src/utils.ts:formatDate",
      };
      const nodes: Node[] = [
        {
          id: "src/api/handler.ts:handleRequest",
          type: "Function",
          name: "handleRequest",
          module: "api",
          package: "main",
          filePath: "src/api/handler.ts",
          startLine: 10,
          endLine: 15,
          exported: true,
        },
      ];

      const result = formatCallers(target, nodes, { snippetsOmitted: false });
      expect(result).not.toContain("snippets omitted");
    });

    it("does not show omission message by default", () => {
      const target: SymbolLocation = {
        name: "formatDate",
        type: "Function",
        file: "src/utils.ts",
        offset: 15,
        limit: 6,
        module: "utils",
        package: "main",
        id: "src/utils.ts:formatDate",
      };
      const nodes: Node[] = [
        {
          id: "src/api/handler.ts:handleRequest",
          type: "Function",
          name: "handleRequest",
          module: "api",
          package: "main",
          filePath: "src/api/handler.ts",
          startLine: 10,
          endLine: 15,
          exported: true,
        },
      ];

      const result = formatCallers(target, nodes);
      expect(result).not.toContain("snippets omitted");
    });
  });
});

describe.skip(formatCallersWithSnippets.name, () => {
  it("formats callers with code snippets", () => {
    const target: SymbolLocation = {
      name: "formatDate",
      type: "Function",
      file: "src/utils.ts",
      offset: 15,
      limit: 6,
      module: "utils",
      package: "main",
      id: "src/utils.ts:formatDate",
    };
    const callers = [
      {
        node: {
          id: "src/api/handler.ts:handleRequest",
          type: "Function" as const,
          name: "handleRequest",
          module: "api",
          package: "main",
          filePath: "src/api/handler.ts",
          startLine: 10,
          endLine: 25,
          exported: true,
          async: true,
          parameters: [{ name: "req", type: "Request" }],
          returnType: "Promise<Response>",
        },
        snippets: [
          {
            callSiteLine: 18,
            startLine: 16,
            endLine: 20,
            code: "const timestamp = req.body.timestamp;\nconst date = formatDate(timestamp);\nif (date) {",
          },
        ],
      },
    ];

    const result = formatCallersWithSnippets(target, callers);
    expect(result).toContain("target:");
    expect(result).toContain("name: formatDate");
    expect(result).toContain("callers[1]:");
    expect(result).toContain("src/api/handler.ts (1 callers):");
    expect(result).toContain("call at line 18:");
    expect(result).toContain("const date = formatDate(timestamp);");
  });

  it("formats multiple snippets per caller", () => {
    const target: SymbolLocation = {
      name: "log",
      type: "Function",
      file: "src/logger.ts",
      offset: 5,
      limit: 3,
      module: "utils",
      package: "main",
      id: "src/logger.ts:log",
    };
    const callers = [
      {
        node: {
          id: "src/service.ts:process",
          type: "Function" as const,
          name: "process",
          module: "core",
          package: "main",
          filePath: "src/service.ts",
          startLine: 10,
          endLine: 30,
          exported: true,
        },
        snippets: [
          {
            callSiteLine: 12,
            startLine: 11,
            endLine: 13,
            code: "// Start processing\nlog('Starting...');",
          },
          {
            callSiteLine: 28,
            startLine: 27,
            endLine: 29,
            code: "// Done\nlog('Finished');",
          },
        ],
      },
    ];

    const result = formatCallersWithSnippets(target, callers);
    expect(result).toContain("call at line 12:");
    expect(result).toContain("call at line 28:");
    expect(result).toContain("log('Starting...')");
    expect(result).toContain("log('Finished')");
  });

  it("handles empty callers list", () => {
    const target: SymbolLocation = {
      name: "unusedFunc",
      type: "Function",
      file: "src/unused.ts",
      offset: 1,
      limit: 5,
      module: "utils",
      package: "main",
      id: "src/unused.ts:unusedFunc",
    };

    const result = formatCallersWithSnippets(target, []);
    expect(result).toContain("callers[0]:");
    expect(result).toContain("(no callers found)");
  });

  it("handles caller with no snippets", () => {
    const target: SymbolLocation = {
      name: "formatDate",
      type: "Function",
      file: "src/utils.ts",
      offset: 15,
      limit: 6,
      module: "utils",
      package: "main",
      id: "src/utils.ts:formatDate",
    };
    const callers = [
      {
        node: {
          id: "src/api/handler.ts:handleRequest",
          type: "Function" as const,
          name: "handleRequest",
          module: "api",
          package: "main",
          filePath: "src/api/handler.ts",
          startLine: 10,
          endLine: 25,
          exported: true,
        },
        snippets: [],
      },
    ];

    const result = formatCallersWithSnippets(target, callers);
    expect(result).toContain("callers[1]:");
    expect(result).toContain("handleRequest");
    expect(result).not.toContain("call at line");
  });
});
