import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractClassNodes } from "./extractClassNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

describe(extractClassNodes.name, () => {
	let project: Project;

	beforeEach(() => {
		project = new Project({ useInMemoryFileSystem: true });
	});

	const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
		filePath,
		module: "core",
		package: "myapp",
	});

	it("extracts class with extends and implements", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`export class User extends BaseUser implements IUser, ISerializable {
  name: string;
}`,
		);
		const context = createContext();

		const classes = extractClassNodes(sourceFile, context);

		expect(classes).toHaveLength(1);
		expect(classes[0]).toMatchObject({
			id: "src/test.ts:User",
			type: "Class",
			name: "User",
			module: "core",
			package: "myapp",
			filePath: "src/test.ts",
			exported: true,
			extends: "BaseUser",
			implements: ["IUser", "ISerializable"],
		});
	});

	it("extracts class without extends or implements", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`class SimpleClass {}`,
		);
		const context = createContext();

		const classes = extractClassNodes(sourceFile, context);

		expect(classes).toHaveLength(1);
		expect(classes[0]?.extends).toBeUndefined();
		expect(classes[0]?.implements).toBeUndefined();
	});

	it("extracts non-exported class", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`class InternalClass {}`,
		);
		const context = createContext();

		const classes = extractClassNodes(sourceFile, context);

		expect(classes).toHaveLength(1);
		expect(classes[0]?.exported).toBe(false);
	});

	it("normalizes extends and implements", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`class C extends Base<{\n\ta: string;\n}> implements I<{\n\tb: number;\n}> {}`,
		);
		const classes = extractClassNodes(sourceFile, createContext());
		expect(classes[0]?.extends).not.toMatch(/[\n\t]/);
		expect(classes[0]?.implements?.[0]).not.toMatch(/[\n\t]/);
	});
});
