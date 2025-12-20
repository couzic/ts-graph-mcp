import { describe, expect, it } from "vitest";
import { extractSymbol, formatLines } from "./nodeFormatters.js";

describe(extractSymbol.name, () => {
	it("extracts symbol from standard node ID", () => {
		expect(extractSymbol("src/db/Types.ts:BaseNode")).toBe("BaseNode");
	});

	it("extracts nested symbol from node ID", () => {
		expect(extractSymbol("src/db/Types.ts:BaseNode.id")).toBe("BaseNode.id");
	});

	it("returns input as-is when no colon present", () => {
		expect(extractSymbol("justAName")).toBe("justAName");
	});

	it("returns file path when node ID has no symbol part", () => {
		expect(extractSymbol("src/db/Types.ts")).toBe("src/db/Types.ts");
	});

	it("handles multiple colons by using first occurrence", () => {
		expect(extractSymbol("src/db/Types.ts:Namespace:Symbol")).toBe(
			"Namespace:Symbol",
		);
	});

	it("handles empty string after colon", () => {
		expect(extractSymbol("src/db/Types.ts:")).toBe("");
	});

	it("handles empty string input", () => {
		expect(extractSymbol("")).toBe("");
	});
});

describe(formatLines.name, () => {
	it("formats same line as single number", () => {
		expect(formatLines(26, 26)).toBe("26");
	});

	it("formats line range with dash separator", () => {
		expect(formatLines(24, 51)).toBe("24-51");
	});

	it("handles single-digit line numbers", () => {
		expect(formatLines(1, 5)).toBe("1-5");
	});

	it("handles large line numbers", () => {
		expect(formatLines(1000, 2000)).toBe("1000-2000");
	});

	it("formats line 1 correctly", () => {
		expect(formatLines(1, 1)).toBe("1");
	});
});
