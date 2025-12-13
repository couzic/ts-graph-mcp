import type { ClassDeclaration, InterfaceDeclaration } from "ts-morph";
import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import type { NodeType } from "../db/Types.js";
import type { ExtractionContext } from "./NodeExtractors.js";
import {
	extractClassNodes,
	extractFileNode,
	extractFunctionNodes,
	extractInterfaceNodes,
	extractMethodNodes,
	extractNodes,
	extractPropertyNodes,
	extractTypeAliasNodes,
	extractVariableNodes,
} from "./NodeExtractors.js";

const getFirstClass = (classes: ClassDeclaration[]): ClassDeclaration => {
	const first = classes[0];
	if (!first) throw new Error("Expected at least one class");
	return first;
};

const getFirstInterface = (
	interfaces: InterfaceDeclaration[],
): InterfaceDeclaration => {
	const first = interfaces[0];
	if (!first) throw new Error("Expected at least one interface");
	return first;
};

describe("NodeExtractors", () => {
	let project: Project;

	beforeEach(() => {
		project = new Project({ useInMemoryFileSystem: true });
	});

	const createContext = (filePath = "src/test.ts"): ExtractionContext => ({
		filePath,
		module: "core",
		package: "myapp",
	});

	describe("extractFileNode", () => {
		it("extracts file node with correct properties", () => {
			const sourceFile = project.createSourceFile(
				"src/utils.ts",
				`export const foo = 1;`,
			);
			const context = createContext("src/utils.ts");

			const fileNode = extractFileNode(sourceFile, context);

			expect(fileNode).toMatchObject({
				id: "src/utils.ts",
				type: "File",
				name: "utils.ts",
				module: "core",
				package: "myapp",
				filePath: "src/utils.ts",
				startLine: 1,
				exported: false,
				extension: ".ts",
			});
		});

		it("extracts tsx file with correct extension", () => {
			const sourceFile = project.createSourceFile(
				"src/Component.tsx",
				`export const Component = () => <div />;`,
			);
			const context = createContext("src/Component.tsx");

			const fileNode = extractFileNode(sourceFile, context);

			expect(fileNode.extension).toBe(".tsx");
			expect(fileNode.name).toBe("Component.tsx");
		});
	});

	describe("extractFunctionNodes", () => {
		it("extracts top-level function with parameters and return type", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`export function formatDate(date: Date, format: string): string {
  return "";
}`,
			);
			const context = createContext();

			const functions = extractFunctionNodes(sourceFile, context);

			expect(functions).toHaveLength(1);
			expect(functions[0]).toMatchObject({
				id: "src/test.ts:formatDate",
				type: "Function",
				name: "formatDate",
				module: "core",
				package: "myapp",
				filePath: "src/test.ts",
				startLine: 1,
				endLine: 3,
				exported: true,
				parameters: [
					{ name: "date", type: "Date" },
					{ name: "format", type: "string" },
				],
				returnType: "string",
				async: false,
			});
		});

		it("extracts async function with async flag", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`export async function fetchData(): Promise<void> {
  await fetch('url');
}`,
			);
			const context = createContext();

			const functions = extractFunctionNodes(sourceFile, context);

			expect(functions).toHaveLength(1);
			expect(functions[0]?.async).toBe(true);
			expect(functions[0]?.returnType).toBe("Promise<void>");
		});

		it("extracts non-exported function", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`function helper() {}`,
			);
			const context = createContext();

			const functions = extractFunctionNodes(sourceFile, context);

			expect(functions).toHaveLength(1);
			expect(functions[0]?.exported).toBe(false);
		});

		it("extracts function without explicit return type", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`function calculate(x: number) {
  return x * 2;
}`,
			);
			const context = createContext();

			const functions = extractFunctionNodes(sourceFile, context);

			expect(functions).toHaveLength(1);
			expect(functions[0]?.returnType).toBeUndefined();
		});

		it("extracts function with no parameters", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`function noParams(): void {}`,
			);
			const context = createContext();

			const functions = extractFunctionNodes(sourceFile, context);

			expect(functions).toHaveLength(1);
			expect(functions[0]?.parameters).toEqual([]);
		});
	});

	describe("extractClassNodes", () => {
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
	});

	describe("extractMethodNodes", () => {
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
	});

	describe("extractInterfaceNodes", () => {
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
	});

	describe("extractTypeAliasNodes", () => {
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
	});

	describe("extractVariableNodes", () => {
		it("extracts const variable with isConst flag", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`export const API_KEY: string = "abc123";`,
			);
			const context = createContext();

			const variables = extractVariableNodes(sourceFile, context);

			expect(variables).toHaveLength(1);
			expect(variables[0]).toMatchObject({
				id: "src/test.ts:API_KEY",
				type: "Variable",
				name: "API_KEY",
				module: "core",
				package: "myapp",
				filePath: "src/test.ts",
				exported: true,
				variableType: "string",
				isConst: true,
			});
		});

		it("extracts let variable with isConst false", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`let counter: number = 0;`,
			);
			const context = createContext();

			const variables = extractVariableNodes(sourceFile, context);

			expect(variables).toHaveLength(1);
			expect(variables[0]?.isConst).toBe(false);
		});

		it("extracts variable without type annotation", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`const value = 42;`,
			);
			const context = createContext();

			const variables = extractVariableNodes(sourceFile, context);

			expect(variables).toHaveLength(1);
			expect(variables[0]?.variableType).toBeUndefined();
		});

		it("extracts multiple variables from one statement", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`const x = 1, y = 2, z = 3;`,
			);
			const context = createContext();

			const variables = extractVariableNodes(sourceFile, context);

			expect(variables).toHaveLength(3);
			expect(variables.map((v) => v.name)).toEqual(["x", "y", "z"]);
		});
	});

	describe("extractPropertyNodes", () => {
		it("extracts class property with type", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`class User {
  email: string;
}`,
			);
			const context = createContext();
			const classDecl = getFirstClass(sourceFile.getClasses());

			const properties = extractPropertyNodes(classDecl, context);

			expect(properties).toHaveLength(1);
			expect(properties[0]).toMatchObject({
				id: "src/test.ts:User.email",
				type: "Property",
				name: "email",
				module: "core",
				package: "myapp",
				filePath: "src/test.ts",
				exported: false,
				propertyType: "string",
				optional: false,
				readonly: false,
			});
		});

		it("extracts optional property", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`class User {
  middleName?: string;
}`,
			);
			const context = createContext();
			const classDecl = getFirstClass(sourceFile.getClasses());

			const properties = extractPropertyNodes(classDecl, context);

			expect(properties).toHaveLength(1);
			expect(properties[0]?.optional).toBe(true);
		});

		it("extracts readonly property", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`class User {
  readonly id: number;
}`,
			);
			const context = createContext();
			const classDecl = getFirstClass(sourceFile.getClasses());

			const properties = extractPropertyNodes(classDecl, context);

			expect(properties).toHaveLength(1);
			expect(properties[0]?.readonly).toBe(true);
		});

		it("extracts interface property", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`interface User {
  name: string;
  age?: number;
}`,
			);
			const context = createContext();
			const interfaceDecl = getFirstInterface(sourceFile.getInterfaces());

			const properties = extractPropertyNodes(interfaceDecl, context);

			expect(properties).toHaveLength(2);
			expect(properties[0]).toMatchObject({
				id: "src/test.ts:User.name",
				name: "name",
				propertyType: "string",
				optional: false,
			});
			expect(properties[1]).toMatchObject({
				id: "src/test.ts:User.age",
				name: "age",
				propertyType: "number",
				optional: true,
			});
		});

		it("extracts property without type annotation", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`class User {
  data;
}`,
			);
			const context = createContext();
			const classDecl = getFirstClass(sourceFile.getClasses());

			const properties = extractPropertyNodes(classDecl, context);

			expect(properties).toHaveLength(1);
			expect(properties[0]?.propertyType).toBeUndefined();
		});
	});

	describe("extractNodes", () => {
		it("extracts all node types from a comprehensive source file", () => {
			const sourceFile = project.createSourceFile(
				"src/comprehensive.ts",
				`
export const VERSION = "1.0.0";

export type UserId = string;

export interface IUser {
  id: UserId;
  name: string;
}

export class User implements IUser {
  id: UserId;
  name: string;

  constructor(id: UserId, name: string) {
    this.id = id;
    this.name = name;
  }

  public validate(): boolean {
    return true;
  }
}

export function createUser(name: string): User {
  return new User("123", name);
}
`,
			);
			const context = createContext("src/comprehensive.ts");

			const nodes = extractNodes(sourceFile, context);

			// Should extract: File, Variable, TypeAlias, Interface, Class, Function
			// Plus: Interface properties (2), Class properties (2), Class method (1)
			expect(nodes.length).toBeGreaterThan(8);

			const nodesByType = nodes.reduce(
				(acc, node) => {
					acc[node.type] = (acc[node.type] || 0) + 1;
					return acc;
				},
				{} as Record<NodeType, number>,
			);

			expect(nodesByType.File).toBe(1);
			expect(nodesByType.Variable).toBe(1);
			expect(nodesByType.TypeAlias).toBe(1);
			expect(nodesByType.Interface).toBe(1);
			expect(nodesByType.Class).toBe(1);
			expect(nodesByType.Function).toBe(1);
			expect(nodesByType.Property).toBe(4); // 2 interface + 2 class
			expect(nodesByType.Method).toBe(1);
		});

		it("extracts file node even for empty file", () => {
			const sourceFile = project.createSourceFile("src/empty.ts", "");
			const context = createContext("src/empty.ts");

			const nodes = extractNodes(sourceFile, context);

			expect(nodes).toHaveLength(1);
			expect(nodes[0]?.type).toBe("File");
		});

		it("handles file with only comments", () => {
			const sourceFile = project.createSourceFile(
				"src/comments.ts",
				`
// This is a comment
/* Block comment */
`,
			);
			const context = createContext("src/comments.ts");

			const nodes = extractNodes(sourceFile, context);

			expect(nodes).toHaveLength(1);
			expect(nodes[0]?.type).toBe("File");
		});
	});

	describe("type text normalization integration", () => {
		// Each function that extracts types should use normalizeTypeText.
		// The comprehensive normalization tests are in NormalizeTypeText.test.ts.
		// These tests verify that each extractor applies normalization.

		it("extractFunctionNodes normalizes parameter and return types", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`function fn(x: {\n\ta: string;\n}): {\n\tb: number;\n} { return { b: 1 }; }`,
			);
			const functions = extractFunctionNodes(sourceFile, createContext());
			expect(functions[0]?.parameters?.[0]?.type).not.toMatch(/[\n\t]/);
			expect(functions[0]?.returnType).not.toMatch(/[\n\t]/);
		});

		it("extractMethodNodes normalizes parameter and return types", () => {
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

		it("extractClassNodes normalizes extends and implements", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`class C extends Base<{\n\ta: string;\n}> implements I<{\n\tb: number;\n}> {}`,
			);
			const classes = extractClassNodes(sourceFile, createContext());
			expect(classes[0]?.extends).not.toMatch(/[\n\t]/);
			expect(classes[0]?.implements?.[0]).not.toMatch(/[\n\t]/);
		});

		it("extractInterfaceNodes normalizes extends", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`interface I extends Base<{\n\ta: string;\n}> {}`,
			);
			const interfaces = extractInterfaceNodes(sourceFile, createContext());
			expect(interfaces[0]?.extends?.[0]).not.toMatch(/[\n\t]/);
		});

		it("extractTypeAliasNodes normalizes aliasedType", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`type T = {\n\ta: string;\n\tb: number;\n};`,
			);
			const typeAliases = extractTypeAliasNodes(sourceFile, createContext());
			expect(typeAliases[0]?.aliasedType).not.toMatch(/[\n\t]/);
		});

		it("extractVariableNodes normalizes variableType", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`const x: {\n\ta: string;\n} = { a: "" };`,
			);
			const variables = extractVariableNodes(sourceFile, createContext());
			expect(variables[0]?.variableType).not.toMatch(/[\n\t]/);
		});

		it("extractPropertyNodes normalizes propertyType", () => {
			const sourceFile = project.createSourceFile(
				"src/test.ts",
				`class C { prop: {\n\ta: string;\n}; }`,
			);
			const classDecl = sourceFile.getClasses()[0];
			if (!classDecl) throw new Error("Expected class");
			const properties = extractPropertyNodes(classDecl, createContext());
			expect(properties[0]?.propertyType).not.toMatch(/[\n\t]/);
		});
	});
});
