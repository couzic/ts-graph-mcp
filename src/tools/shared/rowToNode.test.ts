import { describe, expect, it } from "vitest";
import type { FunctionNode } from "../../db/Types.js";
import type { NodeRow } from "./QueryTypes.js";
import { rowToNode } from "./rowConverters.js";

describe(rowToNode.name, () => {
  describe("basic conversion", () => {
    it("converts snake_case column names to camelCase properties", () => {
      const row: NodeRow = {
        id: "src/utils.ts:formatDate",
        type: "Function",
        name: "formatDate",
        module: "core",
        package: "main",
        file_path: "src/utils.ts",
        start_line: 5,
        end_line: 15,
        exported: 1,
        properties: "{}",
      };

      const node = rowToNode(row);

      expect(node.id).toBe("src/utils.ts:formatDate");
      expect(node.type).toBe("Function");
      expect(node.name).toBe("formatDate");
      expect(node.module).toBe("core");
      expect(node.package).toBe("main");
      expect(node.filePath).toBe("src/utils.ts");
      expect(node.startLine).toBe(5);
      expect(node.endLine).toBe(15);
    });
  });

  describe("boolean conversion", () => {
    it("converts exported=1 to exported=true", () => {
      const row: NodeRow = {
        id: "src/utils.ts:helper",
        type: "Function",
        name: "helper",
        module: "core",
        package: "main",
        file_path: "src/utils.ts",
        start_line: 1,
        end_line: 5,
        exported: 1,
        properties: "{}",
      };

      const node = rowToNode(row);

      expect(node.exported).toBe(true);
    });

    it("converts exported=0 to exported=false", () => {
      const row: NodeRow = {
        id: "src/utils.ts:privateHelper",
        type: "Function",
        name: "privateHelper",
        module: "core",
        package: "main",
        file_path: "src/utils.ts",
        start_line: 1,
        end_line: 5,
        exported: 0,
        properties: "{}",
      };

      const node = rowToNode(row);

      expect(node.exported).toBe(false);
    });
  });

  describe("JSON properties parsing", () => {
    it("parses and spreads type-specific properties", () => {
      const row: NodeRow = {
        id: "src/api/handler.ts:handleRequest",
        type: "Function",
        name: "handleRequest",
        module: "api",
        package: "server",
        file_path: "src/api/handler.ts",
        start_line: 10,
        end_line: 25,
        exported: 1,
        properties: JSON.stringify({
          parameters: [
            { name: "req", type: "Request" },
            { name: "res", type: "Response" },
          ],
          returnType: "Promise<void>",
          async: true,
        }),
      };

      const node = rowToNode(row) as FunctionNode;

      expect(node.parameters).toEqual([
        { name: "req", type: "Request" },
        { name: "res", type: "Response" },
      ]);
      expect(node.returnType).toBe("Promise<void>");
      expect(node.async).toBe(true);
    });
  });
});
