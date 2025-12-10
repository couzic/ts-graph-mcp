import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { Node } from "../db/Types.js";
import {
	type EdgeExtractionContext,
	extractCallEdges,
	extractContainsEdges,
	extractEdges,
	extractImportEdges,
	extractInheritanceEdges,
	extractTypeUsageEdges,
} from "./EdgeExtractors.js";
import { generateNodeId } from "./IdGenerator.js";

describe("EdgeExtractors", () => {
	const createProject = () => new Project({ useInMemoryFileSystem: true });

	const defaultContext: EdgeExtractionContext = {
		filePath: "test.ts",
		module: "test-module",
		package: "test-package",
	};

	describe("extractContainsEdges", () => {
		it("should extract CONTAINS edges from file to its functions", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export const add = (a: number, b: number): number => a + b;
export const subtract = (a: number, b: number): number => a - b;
        `,
			);

			const nodes: Node[] = [
				{
					id: generateNodeId("test.ts"),
					type: "File",
					name: "test.ts",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 1,
					endLine: 3,
					exported: false,
				},
				{
					id: generateNodeId("test.ts", "add"),
					type: "Function",
					name: "add",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 2,
					endLine: 2,
					exported: true,
				},
				{
					id: generateNodeId("test.ts", "subtract"),
					type: "Function",
					name: "subtract",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 3,
					endLine: 3,
					exported: true,
				},
			];

			const edges = extractContainsEdges(sourceFile, nodes, defaultContext);

			expect(edges).toHaveLength(2);
			expect(edges).toContainEqual({
				source: generateNodeId("test.ts"),
				target: generateNodeId("test.ts", "add"),
				type: "CONTAINS",
			});
			expect(edges).toContainEqual({
				source: generateNodeId("test.ts"),
				target: generateNodeId("test.ts", "subtract"),
				type: "CONTAINS",
			});
		});

		it("should extract CONTAINS edges from file to classes", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export class User {
  name: string;
}
        `,
			);

			const nodes: Node[] = [
				{
					id: generateNodeId("test.ts"),
					type: "File",
					name: "test.ts",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 1,
					endLine: 4,
					exported: false,
				},
				{
					id: generateNodeId("test.ts", "User"),
					type: "Class",
					name: "User",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 2,
					endLine: 4,
					exported: true,
				},
			];

			const edges = extractContainsEdges(sourceFile, nodes, defaultContext);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("test.ts"),
				target: generateNodeId("test.ts", "User"),
				type: "CONTAINS",
			});
		});
	});

	describe("extractImportEdges", () => {
		it("should extract IMPORTS edges with imported symbols", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
import { foo, bar } from './utils.js';
        `,
			);

			const edges = extractImportEdges(sourceFile, defaultContext);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("test.ts"),
				target: generateNodeId("utils.ts"),
				type: "IMPORTS",
				isTypeOnly: false,
				importedSymbols: ["foo", "bar"],
			});
		});

		it("should extract type-only imports", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
import type { User } from './types.js';
        `,
			);

			const edges = extractImportEdges(sourceFile, defaultContext);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("test.ts"),
				target: generateNodeId("types.ts"),
				type: "IMPORTS",
				isTypeOnly: true,
				importedSymbols: ["User"],
			});
		});

		it("should handle relative path resolution", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"src/components/Button.ts",
				`
import { utils } from '../utils.js';
        `,
			);

			const context: EdgeExtractionContext = {
				filePath: "src/components/Button.ts",
				module: "test-module",
				package: "test-package",
			};

			const edges = extractImportEdges(sourceFile, context);

			expect(edges).toHaveLength(1);
			expect(edges[0]?.target).toBe(generateNodeId("src/utils.ts"));
		});

		it("should skip external module imports", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
import { describe } from 'vitest';
import { foo } from './local.js';
        `,
			);

			const edges = extractImportEdges(sourceFile, defaultContext);

			expect(edges).toHaveLength(1);
			expect(edges[0]?.target).toBe(generateNodeId("local.ts"));
		});
	});

	describe("extractCallEdges", () => {
		it("should extract CALLS edges between functions", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export const add = (a: number, b: number): number => a + b;
export const calculate = (x: number, y: number): number => add(x, y);
        `,
			);

			const nodes: Node[] = [
				{
					id: generateNodeId("test.ts", "add"),
					type: "Function",
					name: "add",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 2,
					endLine: 2,
					exported: true,
				},
				{
					id: generateNodeId("test.ts", "calculate"),
					type: "Function",
					name: "calculate",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 3,
					endLine: 3,
					exported: true,
				},
			];

			const edges = extractCallEdges(sourceFile, nodes, defaultContext);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("test.ts", "calculate"),
				target: generateNodeId("test.ts", "add"),
				type: "CALLS",
				callCount: 1,
			});
		});

		it("should count multiple calls to the same function", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export const log = (msg: string) => console.log(msg);
export const doWork = () => {
  log('start');
  log('processing');
  log('done');
};
        `,
			);

			const nodes: Node[] = [
				{
					id: generateNodeId("test.ts", "log"),
					type: "Function",
					name: "log",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 2,
					endLine: 2,
					exported: true,
				},
				{
					id: generateNodeId("test.ts", "doWork"),
					type: "Function",
					name: "doWork",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 3,
					endLine: 7,
					exported: true,
				},
			];

			const edges = extractCallEdges(sourceFile, nodes, defaultContext);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("test.ts", "doWork"),
				target: generateNodeId("test.ts", "log"),
				type: "CALLS",
				callCount: 3,
			});
		});

		it("should extract CALLS edges from method to function", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export const validate = (value: string): boolean => value.length > 0;

export class User {
  name: string;

  isValid(): boolean {
    return validate(this.name);
  }
}
        `,
			);

			const nodes: Node[] = [
				{
					id: generateNodeId("test.ts", "validate"),
					type: "Function",
					name: "validate",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 2,
					endLine: 2,
					exported: true,
				},
				{
					id: generateNodeId("test.ts", "User"),
					type: "Class",
					name: "User",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 4,
					endLine: 10,
					exported: true,
				},
				{
					id: generateNodeId("test.ts", "User", "isValid"),
					type: "Method",
					name: "isValid",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 7,
					endLine: 9,
					exported: false,
				},
			];

			const edges = extractCallEdges(sourceFile, nodes, defaultContext);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("test.ts", "User", "isValid"),
				target: generateNodeId("test.ts", "validate"),
				type: "CALLS",
				callCount: 1,
			});
		});
	});

	describe("extractInheritanceEdges", () => {
		it("should extract IMPLEMENTS edges from class to interface", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export interface Nameable {
  name: string;
}

export class User implements Nameable {
  name: string;
}
        `,
			);

			const edges = extractInheritanceEdges(sourceFile, defaultContext);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("test.ts", "User"),
				target: generateNodeId("test.ts", "Nameable"),
				type: "IMPLEMENTS",
			});
		});

		it("should extract EXTENDS edges from class to class", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export class Animal {
  name: string;
}

export class Dog extends Animal {
  breed: string;
}
        `,
			);

			const edges = extractInheritanceEdges(sourceFile, defaultContext);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("test.ts", "Dog"),
				target: generateNodeId("test.ts", "Animal"),
				type: "EXTENDS",
			});
		});

		it("should extract EXTENDS edges from interface to interface", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export interface Named {
  name: string;
}

export interface User extends Named {
  email: string;
}
        `,
			);

			const edges = extractInheritanceEdges(sourceFile, defaultContext);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("test.ts", "User"),
				target: generateNodeId("test.ts", "Named"),
				type: "EXTENDS",
			});
		});

		it("should handle multiple implements", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export interface A { a: string; }
export interface B { b: string; }

export class C implements A, B {
  a: string;
  b: string;
}
        `,
			);

			const edges = extractInheritanceEdges(sourceFile, defaultContext);

			expect(edges).toHaveLength(2);
			expect(edges).toContainEqual({
				source: generateNodeId("test.ts", "C"),
				target: generateNodeId("test.ts", "A"),
				type: "IMPLEMENTS",
			});
			expect(edges).toContainEqual({
				source: generateNodeId("test.ts", "C"),
				target: generateNodeId("test.ts", "B"),
				type: "IMPLEMENTS",
			});
		});

		it("should handle multiple extends for interfaces", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export interface A { a: string; }
export interface B { b: string; }

export interface C extends A, B {
  c: string;
}
        `,
			);

			const edges = extractInheritanceEdges(sourceFile, defaultContext);

			expect(edges).toHaveLength(2);
			expect(edges).toContainEqual({
				source: generateNodeId("test.ts", "C"),
				target: generateNodeId("test.ts", "A"),
				type: "EXTENDS",
			});
			expect(edges).toContainEqual({
				source: generateNodeId("test.ts", "C"),
				target: generateNodeId("test.ts", "B"),
				type: "EXTENDS",
			});
		});
	});

	describe("extractTypeUsageEdges", () => {
		it("should extract USES_TYPE for function parameters", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export interface User {
  name: string;
}

export const greet = (user: User): void => {
  console.log(user.name);
};
        `,
			);

			const edges = extractTypeUsageEdges(sourceFile, defaultContext);

			const paramEdge = edges.find(
				(e) =>
					e.source === generateNodeId("test.ts", "greet") &&
					e.context === "parameter",
			);
			expect(paramEdge).toBeDefined();
			expect(paramEdge).toEqual({
				source: generateNodeId("test.ts", "greet"),
				target: generateNodeId("test.ts", "User"),
				type: "USES_TYPE",
				context: "parameter",
			});
		});

		it("should extract USES_TYPE for function return types", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export interface User {
  name: string;
}

export const getUser = (): User => {
  return { name: 'Alice' };
};
        `,
			);

			const edges = extractTypeUsageEdges(sourceFile, defaultContext);

			const returnEdge = edges.find(
				(e) =>
					e.source === generateNodeId("test.ts", "getUser") &&
					e.context === "return",
			);
			expect(returnEdge).toBeDefined();
			expect(returnEdge).toEqual({
				source: generateNodeId("test.ts", "getUser"),
				target: generateNodeId("test.ts", "User"),
				type: "USES_TYPE",
				context: "return",
			});
		});

		it("should extract USES_TYPE for variable declarations", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export interface User {
  name: string;
}

export const user: User = { name: 'Alice' };
        `,
			);

			const edges = extractTypeUsageEdges(sourceFile, defaultContext);

			const varEdge = edges.find(
				(e) =>
					e.source === generateNodeId("test.ts", "user") &&
					e.context === "variable",
			);
			expect(varEdge).toBeDefined();
			expect(varEdge).toEqual({
				source: generateNodeId("test.ts", "user"),
				target: generateNodeId("test.ts", "User"),
				type: "USES_TYPE",
				context: "variable",
			});
		});

		it("should extract USES_TYPE for property declarations", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
export interface Address {
  street: string;
}

export class User {
  address: Address;
}
        `,
			);

			const edges = extractTypeUsageEdges(sourceFile, defaultContext);

			const propEdge = edges.find(
				(e) =>
					e.source === generateNodeId("test.ts", "User", "address") &&
					e.context === "property",
			);
			expect(propEdge).toBeDefined();
			expect(propEdge).toEqual({
				source: generateNodeId("test.ts", "User", "address"),
				target: generateNodeId("test.ts", "Address"),
				type: "USES_TYPE",
				context: "property",
			});
		});
	});

	describe("extractEdges", () => {
		it("should extract all edge types from a source file", () => {
			const project = createProject();
			const sourceFile = project.createSourceFile(
				"test.ts",
				`
import type { Config } from './config.js';

export interface User {
  name: string;
}

export class UserService {
  config: Config;

  getUser(): User {
    return { name: 'Alice' };
  }
}

export const createUser = (name: string): User => {
  return { name };
};
        `,
			);

			const nodes: Node[] = [
				{
					id: generateNodeId("test.ts"),
					type: "File",
					name: "test.ts",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 1,
					endLine: 18,
					exported: false,
				},
				{
					id: generateNodeId("test.ts", "User"),
					type: "Interface",
					name: "User",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 4,
					endLine: 6,
					exported: true,
				},
				{
					id: generateNodeId("test.ts", "UserService"),
					type: "Class",
					name: "UserService",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 8,
					endLine: 14,
					exported: true,
				},
				{
					id: generateNodeId("test.ts", "createUser"),
					type: "Function",
					name: "createUser",
					module: "test-module",
					package: "test-package",
					filePath: "test.ts",
					startLine: 16,
					endLine: 18,
					exported: true,
				},
			];

			const edges = extractEdges(sourceFile, nodes, defaultContext);

			// Should contain IMPORTS edges
			const importEdges = edges.filter((e) => e.type === "IMPORTS");
			expect(importEdges.length).toBeGreaterThan(0);

			// Should contain CONTAINS edges
			const containsEdges = edges.filter((e) => e.type === "CONTAINS");
			expect(containsEdges.length).toBe(3); // File contains User, UserService, createUser

			// Should contain USES_TYPE edges
			const usesTypeEdges = edges.filter((e) => e.type === "USES_TYPE");
			expect(usesTypeEdges.length).toBeGreaterThan(0);
		});
	});
});
