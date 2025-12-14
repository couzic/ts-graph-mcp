import type { ClassDeclaration } from "ts-morph";
import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractMethodNodes } from "./extractMethodNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

const getFirstClass = (classes: ClassDeclaration[]): ClassDeclaration => {
	const first = classes[0];
	if (!first) throw new Error("Expected at least one class");
	return first;
};

describe(extractMethodNodes.name, () => {
	let project: Project;

	beforeEach(() => {
		project = new Project({ useInMemoryFileSystem: true });
	});

	const createContext = (filePath = "src/test.ts"): NodeExtractionContext => ({
		filePath,
		module: "core",
		package: "myapp",
	});

	it("extracts public method with parameters and return type", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`class User {
  public validate(data: string): boolean {
    return true;
  }
}`,
		);
		const context = createContext();
		const classDecl = getFirstClass(sourceFile.getClasses());

		const methods = extractMethodNodes(classDecl, context);

		expect(methods).toHaveLength(1);
		expect(methods[0]).toMatchObject({
			id: "src/test.ts:User.validate",
			type: "Method",
			name: "validate",
			module: "core",
			package: "myapp",
			filePath: "src/test.ts",
			exported: false,
			parameters: [{ name: "data", type: "string" }],
			returnType: "boolean",
			visibility: "public",
			async: false,
			static: false,
		});
	});

	it("extracts private method", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`class User {
  private helper(): void {}
}`,
		);
		const context = createContext();
		const classDecl = getFirstClass(sourceFile.getClasses());

		const methods = extractMethodNodes(classDecl, context);

		expect(methods).toHaveLength(1);
		expect(methods[0]?.visibility).toBe("private");
	});

	it("extracts protected method", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`class User {
  protected initialize(): void {}
}`,
		);
		const context = createContext();
		const classDecl = getFirstClass(sourceFile.getClasses());

		const methods = extractMethodNodes(classDecl, context);

		expect(methods).toHaveLength(1);
		expect(methods[0]?.visibility).toBe("protected");
	});

	it("extracts static method", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`class User {
  static create(): User {
    return new User();
  }
}`,
		);
		const context = createContext();
		const classDecl = getFirstClass(sourceFile.getClasses());

		const methods = extractMethodNodes(classDecl, context);

		expect(methods).toHaveLength(1);
		expect(methods[0]?.static).toBe(true);
	});

	it("extracts async method", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`class User {
  async save(): Promise<void> {}
}`,
		);
		const context = createContext();
		const classDecl = getFirstClass(sourceFile.getClasses());

		const methods = extractMethodNodes(classDecl, context);

		expect(methods).toHaveLength(1);
		expect(methods[0]?.async).toBe(true);
	});

	it("normalizes parameter and return types", () => {
		const sourceFile = project.createSourceFile(
			"src/test.ts",
			`class C { method(x: {\n\ta: string;\n}): {\n\tb: number;\n} { return { b: 1 }; } }`,
		);
		const classDecl = sourceFile.getClasses()[0];
		if (!classDecl) throw new Error("Expected class");
		const methods = extractMethodNodes(classDecl, createContext());
		expect(methods[0]?.parameters?.[0]?.type).not.toMatch(/[\n\t]/);
		expect(methods[0]?.returnType).not.toMatch(/[\n\t]/);
	});
});
