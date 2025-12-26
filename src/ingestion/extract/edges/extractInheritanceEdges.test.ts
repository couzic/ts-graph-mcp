import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { generateNodeId } from "../../generateNodeId.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractInheritanceEdges } from "./extractInheritanceEdges.js";

describe.skip(extractInheritanceEdges.name, () => {
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

	describe("cross-file inheritance", () => {
		it("extracts EXTENDS edge when base class is imported from another file", () => {
			const project = createProject();

			// Create the base class file
			project.createSourceFile(
				"base.ts",
				`export class Animal {
  name: string;
}`,
			);

			// Create the derived class file that imports the base
			const sourceFile = project.createSourceFile(
				"derived.ts",
				`import { Animal } from "./base";

export class Dog extends Animal {
  breed: string;
}`,
			);

			const context: EdgeExtractionContext = {
				filePath: "derived.ts",
				module: "test-module",
				package: "test-package",
			};

			const edges = extractInheritanceEdges(sourceFile, context);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("derived.ts", "Dog"),
				target: generateNodeId("base.ts", "Animal"),
				type: "EXTENDS",
			});
		});

		it("extracts IMPLEMENTS edge when interface is imported from another file", () => {
			const project = createProject();

			// Create the interface file
			project.createSourceFile(
				"interfaces.ts",
				`export interface Serializable {
  serialize(): string;
}`,
			);

			// Create the class file that imports and implements the interface
			const sourceFile = project.createSourceFile(
				"user.ts",
				`import { Serializable } from "./interfaces";

export class User implements Serializable {
  serialize(): string {
    return JSON.stringify(this);
  }
}`,
			);

			const context: EdgeExtractionContext = {
				filePath: "user.ts",
				module: "test-module",
				package: "test-package",
			};

			const edges = extractInheritanceEdges(sourceFile, context);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("user.ts", "User"),
				target: generateNodeId("interfaces.ts", "Serializable"),
				type: "IMPLEMENTS",
			});
		});

		it("extracts EXTENDS edge when interface extends imported interface", () => {
			const project = createProject();

			// Create the base interface file
			project.createSourceFile(
				"base-types.ts",
				`export interface Entity {
  id: string;
}`,
			);

			// Create the derived interface file
			const sourceFile = project.createSourceFile(
				"user-types.ts",
				`import { Entity } from "./base-types";

export interface User extends Entity {
  email: string;
}`,
			);

			const context: EdgeExtractionContext = {
				filePath: "user-types.ts",
				module: "test-module",
				package: "test-package",
			};

			const edges = extractInheritanceEdges(sourceFile, context);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual({
				source: generateNodeId("user-types.ts", "User"),
				target: generateNodeId("base-types.ts", "Entity"),
				type: "EXTENDS",
			});
		});

		it("handles mix of local and imported base types", () => {
			const project = createProject();

			// Create the imported interface file
			project.createSourceFile(
				"mixins.ts",
				`export interface Timestamped {
  createdAt: Date;
}`,
			);

			// Create file with both local and imported types
			const sourceFile = project.createSourceFile(
				"models.ts",
				`import { Timestamped } from "./mixins";

export interface Named {
  name: string;
}

export class Entity implements Named, Timestamped {
  name: string;
  createdAt: Date;
}`,
			);

			const context: EdgeExtractionContext = {
				filePath: "models.ts",
				module: "test-module",
				package: "test-package",
			};

			const edges = extractInheritanceEdges(sourceFile, context);

			expect(edges).toHaveLength(2);
			expect(edges).toContainEqual({
				source: generateNodeId("models.ts", "Entity"),
				target: generateNodeId("models.ts", "Named"),
				type: "IMPLEMENTS",
			});
			expect(edges).toContainEqual({
				source: generateNodeId("models.ts", "Entity"),
				target: generateNodeId("mixins.ts", "Timestamped"),
				type: "IMPLEMENTS",
			});
		});
	});
});
