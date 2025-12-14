import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { Node } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractCallEdges } from "./extractCallEdges.js";

describe(extractCallEdges.name, () => {
	const createProject = () => new Project({ useInMemoryFileSystem: true });

	const defaultContext: EdgeExtractionContext = {
		filePath: "test.ts",
		module: "test-module",
		package: "test-package",
	};

	it("extracts CALLS edges between functions", () => {
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

	it("counts multiple calls to the same function", () => {
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

	it("extracts CALLS edges from method to function", () => {
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
