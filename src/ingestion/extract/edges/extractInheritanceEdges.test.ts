import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { generateNodeId } from "../../IdGenerator.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractInheritanceEdges } from "./extractInheritanceEdges.js";

describe(extractInheritanceEdges.name, () => {
	const createProject = () => new Project({ useInMemoryFileSystem: true });

	const defaultContext: EdgeExtractionContext = {
		filePath: "test.ts",
		module: "test-module",
		package: "test-package",
	};

	it("extracts IMPLEMENTS edges from class to interface", () => {
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

	it("extracts EXTENDS edges from class to class", () => {
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

	it("extracts EXTENDS edges from interface to interface", () => {
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

	it("handles multiple implements", () => {
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

	it("handles multiple extends for interfaces", () => {
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
