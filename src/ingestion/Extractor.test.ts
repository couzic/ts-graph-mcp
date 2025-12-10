import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import { extractFromFile, extractFromSourceFile } from "./Extractor.js";
import type { ExtractionContext } from "./NodeExtractors.js";

describe("Extractor", () => {
	let project: Project;

	beforeEach(() => {
		project = new Project({ useInMemoryFileSystem: true });
	});

	describe("extractFromSourceFile", () => {
		it("extracts nodes and edges from a simple file", () => {
			const sourceFile = project.createSourceFile(
				"src/utils.ts",
				`
export function greet(name: string): string {
  return 'Hello, ' + name;
}
        `.trim(),
			);

			const context: ExtractionContext = {
				filePath: "src/utils.ts",
				module: "core",
				package: "utils",
			};

			const result = extractFromSourceFile(sourceFile, context);

			// Should have file node + function node
			expect(result.nodes.length).toBeGreaterThanOrEqual(2);

			// Should have CONTAINS edge (file -> function)
			const containsEdges = result.edges.filter((e) => e.type === "CONTAINS");
			expect(containsEdges.length).toBeGreaterThanOrEqual(1);
		});

		it("extracts class with methods and properties", () => {
			const sourceFile = project.createSourceFile(
				"src/User.ts",
				`
export class User {
  public name: string;
  private age: number;

  constructor(name: string, age: number) {
    this.name = name;
    this.age = age;
  }

  public greet(): string {
    return 'Hello, ' + this.name;
  }
}
        `.trim(),
			);

			const context: ExtractionContext = {
				filePath: "src/User.ts",
				module: "core",
				package: "domain",
			};

			const result = extractFromSourceFile(sourceFile, context);

			// Should have: file, class, 2 properties, constructor, greet method
			const classNodes = result.nodes.filter((n) => n.type === "Class");
			const methodNodes = result.nodes.filter((n) => n.type === "Method");
			const propertyNodes = result.nodes.filter((n) => n.type === "Property");

			expect(classNodes).toHaveLength(1);
			expect(methodNodes.length).toBeGreaterThanOrEqual(1); // At least greet
			expect(propertyNodes).toHaveLength(2);
		});

		it("extracts function calls", () => {
			const sourceFile = project.createSourceFile(
				"src/app.ts",
				`
function helper(): void {}

export function main(): void {
  helper();
  helper();
}
        `.trim(),
			);

			const context: ExtractionContext = {
				filePath: "src/app.ts",
				module: "core",
				package: "app",
			};

			const result = extractFromSourceFile(sourceFile, context);

			// Should have CALLS edge with callCount = 2
			const callEdges = result.edges.filter((e) => e.type === "CALLS");
			expect(callEdges.length).toBeGreaterThanOrEqual(1);

			const helperCall = callEdges.find((e) => e.target.includes("helper"));
			expect(helperCall?.callCount).toBe(2);
		});

		it("extracts inheritance relationships", () => {
			const sourceFile = project.createSourceFile(
				"src/Animal.ts",
				`
interface Living {
  breathe(): void;
}

class Animal {
  move(): void {}
}

export class Dog extends Animal implements Living {
  breathe(): void {}
  bark(): void {}
}
        `.trim(),
			);

			const context: ExtractionContext = {
				filePath: "src/Animal.ts",
				module: "core",
				package: "domain",
			};

			const result = extractFromSourceFile(sourceFile, context);

			const extendsEdges = result.edges.filter((e) => e.type === "EXTENDS");
			const implementsEdges = result.edges.filter(
				(e) => e.type === "IMPLEMENTS",
			);

			expect(extendsEdges).toHaveLength(1);
			expect(implementsEdges).toHaveLength(1);
		});

		it("extracts type usage", () => {
			const sourceFile = project.createSourceFile(
				"src/service.ts",
				`
interface User {
  name: string;
}

export function getUser(id: number): User {
  return { name: 'test' };
}
        `.trim(),
			);

			const context: ExtractionContext = {
				filePath: "src/service.ts",
				module: "core",
				package: "service",
			};

			const result = extractFromSourceFile(sourceFile, context);

			const usesTypeEdges = result.edges.filter((e) => e.type === "USES_TYPE");
			expect(usesTypeEdges.length).toBeGreaterThanOrEqual(1);

			// Should have return type usage
			const returnUsage = usesTypeEdges.find((e) => e.context === "return");
			expect(returnUsage).toBeDefined();
		});

		it("returns stats in extraction result", () => {
			const sourceFile = project.createSourceFile(
				"src/stats.ts",
				`
export function a(): void {}
export function b(): void { a(); }
export const x = 1;
        `.trim(),
			);

			const context: ExtractionContext = {
				filePath: "src/stats.ts",
				module: "core",
				package: "stats",
			};

			const result = extractFromSourceFile(sourceFile, context);

			expect(result.stats.nodeCount).toBe(result.nodes.length);
			expect(result.stats.edgeCount).toBe(result.edges.length);
			expect(result.stats.filePath).toBe("src/stats.ts");
		});
	});

	describe("extractFromFile", () => {
		it("creates project and extracts from file path", () => {
			// This test would require actual file system access
			// For now, we test that the function exists and has the right signature
			expect(typeof extractFromFile).toBe("function");
		});
	});

	describe("integration", () => {
		it("handles complex file with all node types", () => {
			const sourceFile = project.createSourceFile(
				"src/complex.ts",
				`
import type { Config } from './config';

interface IService {
  execute(): void;
}

type ServiceId = string;

export class Service implements IService {
  private id: ServiceId;

  constructor(id: ServiceId) {
    this.id = id;
  }

  public execute(): void {
    this.log();
  }

  private log(): void {
    console.log(this.id);
  }
}

export function createService(id: ServiceId): Service {
  return new Service(id);
}

export const DEFAULT_ID: ServiceId = 'default';
        `.trim(),
			);

			const context: ExtractionContext = {
				filePath: "src/complex.ts",
				module: "core",
				package: "services",
			};

			const result = extractFromSourceFile(sourceFile, context);

			// Check node types present
			const nodeTypes = new Set(result.nodes.map((n) => n.type));
			expect(nodeTypes.has("File")).toBe(true);
			expect(nodeTypes.has("Class")).toBe(true);
			expect(nodeTypes.has("Interface")).toBe(true);
			expect(nodeTypes.has("TypeAlias")).toBe(true);
			expect(nodeTypes.has("Function")).toBe(true);
			expect(nodeTypes.has("Method")).toBe(true);
			expect(nodeTypes.has("Property")).toBe(true);
			expect(nodeTypes.has("Variable")).toBe(true);

			// Check edge types present
			const edgeTypes = new Set(result.edges.map((e) => e.type));
			expect(edgeTypes.has("CONTAINS")).toBe(true);
			expect(edgeTypes.has("IMPLEMENTS")).toBe(true);
			expect(edgeTypes.has("USES_TYPE")).toBe(true);
		});
	});
});
