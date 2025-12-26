import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractInterfaceNodes } from "./extractInterfaceNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

describe.skip(extractInterfaceNodes.name, () => {
	let project: Project;

	beforeEach(() => {
		project = new Project({ useInMemoryFileSystem: true });
	});

	const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
		filePath,
		module: "core",
		package: "myapp",
	});

	it("extracts interface with extends", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`export interface User extends BaseUser, Serializable {
  name: string;
}`,
		);
		const context = createContext();

		const interfaces = extractInterfaceNodes(sourceFile, context);

		expect(interfaces).toHaveLength(1);
		expect(interfaces[0]).toMatchObject({
			id: "src/test.ts:User",
			type: "Interface",
			name: "User",
			module: "core",
			package: "myapp",
			filePath: "src/test.ts",
			exported: true,
			extends: ["BaseUser", "Serializable"],
		});
	});

	it("extracts interface without extends", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`interface SimpleInterface {
  value: number;
}`,
		);
		const context = createContext();

		const interfaces = extractInterfaceNodes(sourceFile, context);

		expect(interfaces).toHaveLength(1);
		expect(interfaces[0]?.extends).toBeUndefined();
	});

	it("extracts non-exported interface", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`interface InternalInterface {}`,
		);
		const context = createContext();

		const interfaces = extractInterfaceNodes(sourceFile, context);

		expect(interfaces).toHaveLength(1);
		expect(interfaces[0]?.exported).toBe(false);
	});

	it("normalizes extends", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`interface I extends Base<{\n\ta: string;\n}> {}`,
		);
		const interfaces = extractInterfaceNodes(sourceFile, createContext());
		expect(interfaces[0]?.extends?.[0]).not.toMatch(/[\n\t]/);
	});
});
