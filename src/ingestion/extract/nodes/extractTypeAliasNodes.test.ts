import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractTypeAliasNodes } from "./extractTypeAliasNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

describe(extractTypeAliasNodes.name, () => {
	let project: Project;

	beforeEach(() => {
		project = new Project({ useInMemoryFileSystem: true });
	});

	const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
		filePath,
		module: "core",
		package: "myapp",
	});

	it("extracts type alias with aliasedType", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`export type UserId = string;`,
		);
		const context = createContext();

		const typeAliases = extractTypeAliasNodes(sourceFile, context);

		expect(typeAliases).toHaveLength(1);
		expect(typeAliases[0]).toMatchObject({
			id: "src/test.ts:UserId",
			type: "TypeAlias",
			name: "UserId",
			module: "core",
			package: "myapp",
			filePath: "src/test.ts",
			exported: true,
			aliasedType: "string",
		});
	});

	it("extracts union type alias", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`type Status = "active" | "inactive" | "pending";`,
		);
		const context = createContext();

		const typeAliases = extractTypeAliasNodes(sourceFile, context);

		expect(typeAliases).toHaveLength(1);
		expect(typeAliases[0]?.aliasedType).toBe(
			'"active" | "inactive" | "pending"',
		);
	});

	it("extracts non-exported type alias", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`type InternalType = number;`,
		);
		const context = createContext();

		const typeAliases = extractTypeAliasNodes(sourceFile, context);

		expect(typeAliases).toHaveLength(1);
		expect(typeAliases[0]?.exported).toBe(false);
	});

	it("normalizes aliasedType", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`type T = {\n\ta: string;\n\tb: number;\n};`,
		);
		const typeAliases = extractTypeAliasNodes(sourceFile, createContext());
		expect(typeAliases[0]?.aliasedType).not.toMatch(/[\n\t]/);
	});
});
