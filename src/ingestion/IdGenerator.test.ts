import { describe, expect, it } from "vitest";
import { generateNodeId, parseNodeId } from "./IdGenerator.js";

describe("IdGenerator", () => {
	describe("generateNodeId", () => {
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

	describe("parseNodeId", () => {
		it("parses simple function ID", () => {
			const result = parseNodeId("src/utils.ts:formatDate");
			expect(result).toEqual({
				filePath: "src/utils.ts",
				symbolPath: ["formatDate"],
			});
		});

		it("parses class ID", () => {
			const result = parseNodeId("src/models/user.ts:User");
			expect(result).toEqual({
				filePath: "src/models/user.ts",
				symbolPath: ["User"],
			});
		});

		it("parses method ID", () => {
			const result = parseNodeId("src/models/user.ts:User.validate");
			expect(result).toEqual({
				filePath: "src/models/user.ts",
				symbolPath: ["User", "validate"],
			});
		});

		it("parses deeply nested ID", () => {
			const result = parseNodeId("src/index.ts:Outer.Inner.deepMethod");
			expect(result).toEqual({
				filePath: "src/index.ts",
				symbolPath: ["Outer", "Inner", "deepMethod"],
			});
		});

		it("parses file-only ID", () => {
			const result = parseNodeId("src/index.ts");
			expect(result).toEqual({
				filePath: "src/index.ts",
				symbolPath: [],
			});
		});

		it("parses overloaded function ID", () => {
			const result = parseNodeId("src/math.ts:add(number,number)");
			expect(result).toEqual({
				filePath: "src/math.ts",
				symbolPath: ["add(number,number)"],
			});
		});

		it("handles paths with multiple colons (Windows drive)", () => {
			// Edge case: C:/projects/app/src/index.ts:func
			// The first colon is part of the path
			const result = parseNodeId("C:/projects/src/index.ts:func");
			expect(result).toEqual({
				filePath: "C:/projects/src/index.ts",
				symbolPath: ["func"],
			});
		});
	});
});
