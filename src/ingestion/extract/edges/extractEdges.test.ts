import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { Node } from "../../../db/Types.js";
import { generateNodeId } from "../../IdGenerator.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractEdges } from "./extractEdges.js";

describe(extractEdges.name, () => {
	const createProject = () => new Project({ useInMemoryFileSystem: true });

	const defaultContext: EdgeExtractionContext = {
		filePath: "test.ts",
		module: "test-module",
		package: "test-package",
	};

	it("extracts all edge types from a source file", () => {
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
