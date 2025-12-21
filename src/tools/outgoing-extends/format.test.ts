import { describe, expect, it } from "vitest";
import type { SymbolLocation } from "../shared/resolveSymbol.js";
import { formatExtends } from "./format.js";
import type { NodeWithDepth } from "./query.js";

describe(formatExtends.name, () => {
	const source: SymbolLocation = {
		id: "src/classes.ts:AdminService",
		name: "AdminService",
		type: "Class",
		file: "src/classes.ts",
		offset: 23,
		limit: 5,
		module: "test-module",
		package: "test-package",
	};

	it("formats empty result (no parents)", () => {
		const result = formatExtends(source, []);

		expect(result).toContain("source:");
		expect(result).toContain("name: AdminService");
		expect(result).toContain("type: Class");
		expect(result).toContain("extends[0]:");
		expect(result).toContain("(no parent classes or interfaces found)");
	});

	it("formats single-level inheritance", () => {
		const nodes: NodeWithDepth[] = [
			{
				id: "src/classes.ts:UserService",
				type: "Class",
				name: "UserService",
				module: "test-module",
				package: "test-package",
				filePath: "src/classes.ts",
				startLine: 11,
				endLine: 21,
				exported: true,
				depth: 1,
			},
		];

		const result = formatExtends(source, nodes);

		expect(result).toContain("source:");
		expect(result).toContain("name: AdminService");
		expect(result).toContain("extends[1]:");
		expect(result).toContain("depth 1:");
		expect(result).toContain("UserService");
		expect(result).toContain("offset: 11, limit: 11");
	});

	it("formats multi-level inheritance chain", () => {
		const nodes: NodeWithDepth[] = [
			{
				id: "src/classes.ts:UserService",
				type: "Class",
				name: "UserService",
				module: "test-module",
				package: "test-package",
				filePath: "src/classes.ts",
				startLine: 11,
				endLine: 21,
				exported: true,
				depth: 1,
			},
			{
				id: "src/classes.ts:BaseService",
				type: "Class",
				name: "BaseService",
				module: "test-module",
				package: "test-package",
				filePath: "src/classes.ts",
				startLine: 3,
				endLine: 9,
				exported: true,
				depth: 2,
			},
		];

		const result = formatExtends(source, nodes);

		expect(result).toContain("extends[2]:");
		expect(result).toContain("depth 1:");
		expect(result).toContain("UserService");
		expect(result).toContain("offset: 11, limit: 11");
		expect(result).toContain("depth 2:");
		expect(result).toContain("BaseService");
		expect(result).toContain("offset: 3, limit: 7");
	});

	it("formats interface inheritance", () => {
		const interfaceSource: SymbolLocation = {
			id: "src/interfaces.ts:AdminUser",
			name: "AdminUser",
			type: "Interface",
			file: "src/interfaces.ts",
			offset: 13,
			limit: 4,
			module: "test-module",
			package: "test-package",
		};

		const nodes: NodeWithDepth[] = [
			{
				id: "src/interfaces.ts:User",
				type: "Interface",
				name: "User",
				module: "test-module",
				package: "test-package",
				filePath: "src/interfaces.ts",
				startLine: 8,
				endLine: 11,
				exported: true,
				extends: ["BaseEntity"],
				depth: 1,
			},
			{
				id: "src/interfaces.ts:BaseEntity",
				type: "Interface",
				name: "BaseEntity",
				module: "test-module",
				package: "test-package",
				filePath: "src/interfaces.ts",
				startLine: 3,
				endLine: 6,
				exported: true,
				depth: 2,
			},
		];

		const result = formatExtends(interfaceSource, nodes);

		expect(result).toContain("name: AdminUser");
		expect(result).toContain("type: Interface");
		expect(result).toContain("extends[2]:");
		expect(result).toContain("depth 1:");
		expect(result).toContain("User");
		expect(result).toContain("extends:[BaseEntity]");
		expect(result).toContain("depth 2:");
		expect(result).toContain("BaseEntity");
	});
});
