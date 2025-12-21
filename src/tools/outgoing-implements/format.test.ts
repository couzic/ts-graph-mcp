import { describe, expect, it } from "vitest";
import type { Node } from "../../db/Types.js";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatInterfaces } from "./format.js";

describe(formatInterfaces.name, () => {
	const targetClass: SymbolLocation = {
		id: "src/models.ts:AuditLog",
		name: "AuditLog",
		type: "Class",
		module: "test",
		package: "main",
		file: "src/models.ts",
		offset: 31,
		limit: 9,
	};

	it("formats single interface implementation", () => {
		const interfaces: Node[] = [
			{
				id: "src/types.ts:Auditable",
				type: "Interface",
				name: "Auditable",
				module: "test",
				package: "main",
				filePath: "src/types.ts",
				startLine: 16,
				endLine: 19,
				exported: true,
			},
		];

		const result = formatInterfaces(targetClass, interfaces);

		expect(result).toContain("class: AuditLog");
		expect(result).toContain("type: Class");
		expect(result).toContain("offset: 31");
		expect(result).toContain("limit: 9");
		expect(result).toContain("implements (1 packages):");
		expect(result).toContain("main:");
		expect(result).toContain("- Auditable (Interface)");
		expect(result).toContain("src/types.ts:16-19");
		expect(result).toContain("offset: 16, limit: 4");
	});

	it("formats no interfaces", () => {
		const result = formatInterfaces(targetClass, []);

		expect(result).toContain("class: AuditLog");
		expect(result).toContain("implements (0 packages):");
		expect(result).toContain("(no interfaces implemented)");
	});

	it("groups interfaces by package", () => {
		const interfaces: Node[] = [
			{
				id: "pkg1/src/IFoo.ts:IFoo",
				type: "Interface",
				name: "IFoo",
				module: "test",
				package: "pkg1",
				filePath: "pkg1/src/IFoo.ts",
				startLine: 1,
				endLine: 3,
				exported: true,
			},
			{
				id: "pkg2/src/IBar.ts:IBar",
				type: "Interface",
				name: "IBar",
				module: "test",
				package: "pkg2",
				filePath: "pkg2/src/IBar.ts",
				startLine: 5,
				endLine: 7,
				exported: true,
			},
		];

		const result = formatInterfaces(targetClass, interfaces);

		expect(result).toContain("implements (2 packages):");
		expect(result).toContain("pkg1:");
		expect(result).toContain("- IFoo (Interface)");
		expect(result).toContain("pkg2:");
		expect(result).toContain("- IBar (Interface)");
	});

	it("sorts packages alphabetically", () => {
		const interfaces: Node[] = [
			{
				id: "zebra/src/IZ.ts:IZ",
				type: "Interface",
				name: "IZ",
				module: "test",
				package: "zebra",
				filePath: "zebra/src/IZ.ts",
				startLine: 1,
				endLine: 3,
				exported: true,
			},
			{
				id: "alpha/src/IA.ts:IA",
				type: "Interface",
				name: "IA",
				module: "test",
				package: "alpha",
				filePath: "alpha/src/IA.ts",
				startLine: 5,
				endLine: 7,
				exported: true,
			},
		];

		const result = formatInterfaces(targetClass, interfaces);
		const lines = result.split("\n");

		// Find package headers
		const alphaIndex = lines.indexOf("alpha:");
		const zebraIndex = lines.indexOf("zebra:");

		expect(alphaIndex).toBeGreaterThan(-1);
		expect(zebraIndex).toBeGreaterThan(-1);
		expect(alphaIndex).toBeLessThan(zebraIndex);
	});
});
