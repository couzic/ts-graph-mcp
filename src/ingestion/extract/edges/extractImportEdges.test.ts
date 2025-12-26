import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { generateNodeId } from "../../generateNodeId.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractImportEdges } from "./extractImportEdges.js";

describe.skip(extractImportEdges.name, () => {
	const createProject = () => new Project({ useInMemoryFileSystem: true });

	const defaultContext: EdgeExtractionContext = {
		filePath: "test.ts",
		module: "test-module",
		package: "test-package",
	};

	it("extracts IMPORTS edges with imported symbols", () => {
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

	it("extracts type-only imports", () => {
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

	it("handles relative path resolution", () => {
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

	it("skips external module imports", () => {
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
