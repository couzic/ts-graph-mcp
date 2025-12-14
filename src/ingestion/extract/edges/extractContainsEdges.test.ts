import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { Node } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractContainsEdges } from "./extractContainsEdges.js";

describe(extractContainsEdges.name, () => {
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
