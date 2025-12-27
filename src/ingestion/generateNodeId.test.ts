import { describe, expect, it } from "vitest";
import { generateNodeId } from "./generateNodeId.js";

describe("IdGenerator", () => {
  describe(generateNodeId.name, () => {
    it("generates ID for top-level function", () => {
      const id = generateNodeId("src/utils.ts", "formatDate");
      expect(id).toBe("src/utils.ts:formatDate");
    });

    it("generates ID for class", () => {
      const id = generateNodeId("src/models/user.ts", "User");
      expect(id).toBe("src/models/user.ts:User");
    });

    it("generates ID for class method", () => {
      const id = generateNodeId("src/models/user.ts", "User", "validate");
      expect(id).toBe("src/models/user.ts:User.validate");
    });

    it("generates ID for nested class method", () => {
      const id = generateNodeId(
        "src/services/api.ts",
        "ApiService",
        "handleRequest",
      );
      expect(id).toBe("src/services/api.ts:ApiService.handleRequest");
    });

    it("generates ID for interface property", () => {
      const id = generateNodeId("src/types.ts", "User", "email");
      expect(id).toBe("src/types.ts:User.email");
    });

    it("generates ID for deeply nested symbol", () => {
      const id = generateNodeId("src/index.ts", "Outer", "Inner", "deepMethod");
      expect(id).toBe("src/index.ts:Outer.Inner.deepMethod");
    });

    it("generates ID for file node (no symbol)", () => {
      const id = generateNodeId("src/index.ts");
      expect(id).toBe("src/index.ts");
    });

    it("normalizes Windows paths to forward slashes", () => {
      const id = generateNodeId("src\\models\\user.ts", "User");
      expect(id).toBe("src/models/user.ts:User");
    });

    it("handles overloaded function with signature", () => {
      const id = generateNodeId("src/math.ts", "add(number,number)");
      expect(id).toBe("src/math.ts:add(number,number)");
    });
  });
});
