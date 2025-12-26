import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { generateNodeId } from "../../generateNodeId.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractContainsEdges } from "./extractContainsEdges.js";

describe.skip(extractContainsEdges.name, () => {
	const createProject = () => new Project({ useInMemoryFileSystem: true });

	const defaultContext: EdgeExtractionContext = {
		filePath: "test.ts",
		module: "test-module",
		package: "test-package",
	};

	it("extracts CONTAINS edges from file to its functions", () => {
		const project = createProject();
		const sourceFile = project.createSourceFile(
			"test.ts",
			`
export const add = (a: number, b: number): number => a + b;
export const subtract = (a: number, b: number): number => a - b;
        `,
		);

		const edges = extractContainsEdges(sourceFile, defaultContext);

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

	it("extracts CONTAINS edges from file to classes", () => {
		const project = createProject();
		const sourceFile = project.createSourceFile(
			"test.ts",
			`
export class User {
  name: string;
}
        `,
		);

		const edges = extractContainsEdges(sourceFile, defaultContext);

		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({
			source: generateNodeId("test.ts"),
			target: generateNodeId("test.ts", "User"),
			type: "CONTAINS",
		});
	});
});
