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

	it("extracts cross-file function calls", () => {
		const project = createProject();

		// File A: utility function to be called
		// Note: We create the file but don't need to reference it - handler.ts imports from it
		project.createSourceFile(
			"utils.ts",
			`
export const formatDate = (date: Date): string => {
  return date.toISOString();
};
        `,
		);

		// File B: handler that calls the utility
		const handlerFile = project.createSourceFile(
			"handler.ts",
			`
import { formatDate } from './utils';

export const processEvent = (timestamp: Date): string => {
  return formatDate(timestamp);
};
        `,
		);

		// All nodes from both files (simulating what extractNodes would produce)
		const nodes: Node[] = [
			{
				id: generateNodeId("utils.ts", "formatDate"),
				type: "Function",
				name: "formatDate",
				module: "test-module",
				package: "test-package",
				filePath: "utils.ts",
				startLine: 2,
				endLine: 4,
				exported: true,
			},
			{
				id: generateNodeId("handler.ts", "processEvent"),
				type: "Function",
				name: "processEvent",
				module: "test-module",
				package: "test-package",
				filePath: "handler.ts",
				startLine: 4,
				endLine: 6,
				exported: true,
			},
		];

		// Extract edges from handler.ts (which imports and calls formatDate)
		const edges = extractCallEdges(handlerFile, nodes, {
			filePath: "handler.ts",
			module: "test-module",
			package: "test-package",
		});

		// This test SHOULD pass but will FAIL due to the bug
		// Expected: CALLS edge from processEvent → formatDate
		// Actual: No edges extracted because buildSymbolMap only includes same-file symbols
		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({
			source: generateNodeId("handler.ts", "processEvent"),
			target: generateNodeId("utils.ts", "formatDate"),
			type: "CALLS",
			callCount: 1,
		});
	});
});
