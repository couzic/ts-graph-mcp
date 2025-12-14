import { describe, expect, it } from "vitest";
import type { Node } from "../../../db/Types.js";
import { buildSymbolMap } from "./buildSymbolMap.js";

describe(buildSymbolMap.name, () => {
	// Helper to create a minimal node for testing
	const createNode = (
		filePath: string,
		name: string,
		type: Node["type"] = "Function",
		symbolPath?: string,
	): Node => ({
		id: `${filePath}:${symbolPath ?? name}`,
		type,
		name,
		module: "test",
		package: "test",
		filePath,
		startLine: 1,
		endLine: 10,
		exported: true,
	});

	describe("same-file symbols", () => {
		it("maps function names to node IDs", () => {
			const nodes: Node[] = [
				createNode("utils.ts", "formatDate"),
				createNode("utils.ts", "parseDate"),
			];

			const map = buildSymbolMap(nodes, "utils.ts");

			expect(map.size).toBe(2);
			expect(map.get("formatDate")).toBe("utils.ts:formatDate");
			expect(map.get("parseDate")).toBe("utils.ts:parseDate");
		});

		it("maps variable names to node IDs", () => {
			const nodes: Node[] = [
				createNode("config.ts", "DEFAULT_TIMEOUT", "Variable"),
				createNode("config.ts", "createConfig", "Variable"),
			];

			const map = buildSymbolMap(nodes, "config.ts");

			expect(map.size).toBe(2);
			expect(map.get("DEFAULT_TIMEOUT")).toBe("config.ts:DEFAULT_TIMEOUT");
			expect(map.get("createConfig")).toBe("config.ts:createConfig");
		});

		it("maps class names to node IDs", () => {
			const nodes: Node[] = [createNode("models.ts", "User", "Class")];

			const map = buildSymbolMap(nodes, "models.ts");

			expect(map.get("User")).toBe("models.ts:User");
		});

		it("maps interface names to node IDs", () => {
			const nodes: Node[] = [createNode("types.ts", "UserDTO", "Interface")];

			const map = buildSymbolMap(nodes, "types.ts");

			expect(map.get("UserDTO")).toBe("types.ts:UserDTO");
		});

		it("maps type alias names to node IDs", () => {
			const nodes: Node[] = [createNode("types.ts", "UserId", "TypeAlias")];

			const map = buildSymbolMap(nodes, "types.ts");

			expect(map.get("UserId")).toBe("types.ts:UserId");
		});
	});

	describe("nested symbols", () => {
		it("extracts method names from class methods", () => {
			const nodes: Node[] = [
				createNode("user.ts", "save", "Method", "User.save"),
				createNode("user.ts", "validate", "Method", "User.validate"),
			];

			const map = buildSymbolMap(nodes, "user.ts");

			// Should map by the last part of the symbol path
			expect(map.get("save")).toBe("user.ts:User.save");
			expect(map.get("validate")).toBe("user.ts:User.validate");
		});

		it("extracts property names from class properties", () => {
			const nodes: Node[] = [
				createNode("user.ts", "name", "Property", "User.name"),
				createNode("user.ts", "email", "Property", "User.email"),
			];

			const map = buildSymbolMap(nodes, "user.ts");

			expect(map.get("name")).toBe("user.ts:User.name");
			expect(map.get("email")).toBe("user.ts:User.email");
		});

		it("handles deeply nested symbols", () => {
			// Hypothetical deeply nested symbol
			const nodes: Node[] = [
				createNode(
					"nested.ts",
					"innerMethod",
					"Method",
					"Outer.Inner.innerMethod",
				),
			];

			const map = buildSymbolMap(nodes, "nested.ts");

			expect(map.get("innerMethod")).toBe("nested.ts:Outer.Inner.innerMethod");
		});
	});

	describe("symbol name collisions", () => {
		it("overwrites with last occurrence for same symbol name", () => {
			// If two symbols have the same name, the last one wins
			const nodes: Node[] = [
				createNode("file.ts", "process", "Function"),
				createNode("file.ts", "process", "Method", "Handler.process"),
			];

			const map = buildSymbolMap(nodes, "file.ts");

			// Last occurrence wins
			expect(map.get("process")).toBe("file.ts:Handler.process");
		});
	});

	describe("file filtering", () => {
		it("excludes nodes from other files", () => {
			const nodes: Node[] = [
				createNode("utils.ts", "formatDate"),
				createNode("other.ts", "otherFunction"),
			];

			const map = buildSymbolMap(nodes, "utils.ts");

			expect(map.size).toBe(1);
			expect(map.get("formatDate")).toBe("utils.ts:formatDate");
			expect(map.has("otherFunction")).toBe(false);
		});

		it("excludes File nodes", () => {
			const nodes: Node[] = [
				createNode("utils.ts", "utils.ts", "File"),
				createNode("utils.ts", "formatDate"),
			];

			const map = buildSymbolMap(nodes, "utils.ts");

			// Only the function should be in the map, not the File node
			expect(map.size).toBe(1);
			expect(map.get("formatDate")).toBe("utils.ts:formatDate");
		});
	});

	describe("edge cases", () => {
		it("returns empty map for empty nodes list", () => {
			const map = buildSymbolMap([], "utils.ts");

			expect(map.size).toBe(0);
		});

		it("returns empty map when no nodes match the file path", () => {
			const nodes: Node[] = [createNode("other.ts", "someFunction")];

			const map = buildSymbolMap(nodes, "utils.ts");

			expect(map.size).toBe(0);
		});

		it("handles file paths with special characters", () => {
			const nodes: Node[] = [
				createNode("src/utils/date-time.ts", "formatDate"),
			];

			const map = buildSymbolMap(nodes, "src/utils/date-time.ts");

			expect(map.get("formatDate")).toBe("src/utils/date-time.ts:formatDate");
		});

		it("handles file paths with spaces", () => {
			const nodes: Node[] = [createNode("src/my utils/helpers.ts", "helper")];

			const map = buildSymbolMap(nodes, "src/my utils/helpers.ts");

			expect(map.get("helper")).toBe("src/my utils/helpers.ts:helper");
		});
	});

	describe("without sourceFile (backward compatibility)", () => {
		it("only includes same-file symbols when sourceFile not provided", () => {
			const nodes: Node[] = [
				createNode("utils.ts", "formatDate"),
				createNode("handler.ts", "processEvent"),
			];

			// Without sourceFile, cross-file symbols are not resolved
			const map = buildSymbolMap(nodes, "handler.ts");

			expect(map.size).toBe(1);
			expect(map.get("processEvent")).toBe("handler.ts:processEvent");
			expect(map.has("formatDate")).toBe(false);
		});
	});

	describe("with sourceFile (cross-file imports)", () => {
		// Helper to create a ts-morph project for import tests
		const createProject = () => {
			const { Project } = require("ts-morph");
			return new Project({ useInMemoryFileSystem: true });
		};

		it("includes named imports from other files", () => {
			const project = createProject();

			// Create the source file with an import
			const handlerFile = project.createSourceFile(
				"handler.ts",
				`
import { formatDate } from './utils';

export const processEvent = () => formatDate(new Date());
				`,
			);

			// Create the target file (needed for import resolution in ts-morph)
			project.createSourceFile(
				"utils.ts",
				`export const formatDate = (d: Date) => d.toISOString();`,
			);

			const nodes: Node[] = [
				createNode("utils.ts", "formatDate"),
				createNode("handler.ts", "processEvent"),
			];

			const map = buildSymbolMap(nodes, "handler.ts", handlerFile);

			expect(map.size).toBe(2);
			expect(map.get("processEvent")).toBe("handler.ts:processEvent");
			expect(map.get("formatDate")).toBe("utils.ts:formatDate");
		});

		it("handles aliased imports", () => {
			const project = createProject();

			const handlerFile = project.createSourceFile(
				"handler.ts",
				`
import { formatDate as fd } from './utils';

export const processEvent = () => fd(new Date());
				`,
			);

			project.createSourceFile(
				"utils.ts",
				`export const formatDate = (d: Date) => d.toISOString();`,
			);

			const nodes: Node[] = [
				createNode("utils.ts", "formatDate"),
				createNode("handler.ts", "processEvent"),
			];

			const map = buildSymbolMap(nodes, "handler.ts", handlerFile);

			// Aliased as 'fd' locally, but maps to formatDate node
			expect(map.get("fd")).toBe("utils.ts:formatDate");
			expect(map.has("formatDate")).toBe(false); // Original name not in map
		});

		it("handles multiple imports from same file", () => {
			const project = createProject();

			const handlerFile = project.createSourceFile(
				"handler.ts",
				`
import { formatDate, parseDate } from './utils';

export const process = () => {
  const d = parseDate("2024-01-01");
  return formatDate(d);
};
				`,
			);

			project.createSourceFile(
				"utils.ts",
				`
export const formatDate = (d: Date) => d.toISOString();
export const parseDate = (s: string) => new Date(s);
				`,
			);

			const nodes: Node[] = [
				createNode("utils.ts", "formatDate"),
				createNode("utils.ts", "parseDate"),
				createNode("handler.ts", "process"),
			];

			const map = buildSymbolMap(nodes, "handler.ts", handlerFile);

			expect(map.size).toBe(3);
			expect(map.get("formatDate")).toBe("utils.ts:formatDate");
			expect(map.get("parseDate")).toBe("utils.ts:parseDate");
			expect(map.get("process")).toBe("handler.ts:process");
		});

		it("skips type-only imports", () => {
			const project = createProject();

			const handlerFile = project.createSourceFile(
				"handler.ts",
				`
import type { DateFormatter } from './types';
import { formatDate } from './utils';

export const process = () => formatDate(new Date());
				`,
			);

			project.createSourceFile(
				"types.ts",
				`export type DateFormatter = (d: Date) => string;`,
			);
			project.createSourceFile(
				"utils.ts",
				`export const formatDate = (d: Date) => d.toISOString();`,
			);

			const nodes: Node[] = [
				createNode("types.ts", "DateFormatter", "TypeAlias"),
				createNode("utils.ts", "formatDate"),
				createNode("handler.ts", "process"),
			];

			const map = buildSymbolMap(nodes, "handler.ts", handlerFile);

			// Type-only imports are skipped
			expect(map.has("DateFormatter")).toBe(false);
			expect(map.get("formatDate")).toBe("utils.ts:formatDate");
		});

		it("skips external module imports", () => {
			const project = createProject();

			const handlerFile = project.createSourceFile(
				"handler.ts",
				`
import { join } from 'path';
import { formatDate } from './utils';

export const process = () => join('a', 'b');
				`,
			);

			project.createSourceFile(
				"utils.ts",
				`export const formatDate = (d: Date) => d.toISOString();`,
			);

			const nodes: Node[] = [
				createNode("utils.ts", "formatDate"),
				createNode("handler.ts", "process"),
			];

			const map = buildSymbolMap(nodes, "handler.ts", handlerFile);

			// External 'path' module not in map
			expect(map.has("join")).toBe(false);
			expect(map.get("formatDate")).toBe("utils.ts:formatDate");
		});

		it("handles imports from nested directories", () => {
			const project = createProject();

			const handlerFile = project.createSourceFile(
				"src/handlers/event.ts",
				`
import { formatDate } from '../utils/date';

export const process = () => formatDate(new Date());
				`,
			);

			project.createSourceFile(
				"src/utils/date.ts",
				`export const formatDate = (d: Date) => d.toISOString();`,
			);

			const nodes: Node[] = [
				createNode("src/utils/date.ts", "formatDate"),
				createNode("src/handlers/event.ts", "process"),
			];

			const map = buildSymbolMap(nodes, "src/handlers/event.ts", handlerFile);

			expect(map.get("formatDate")).toBe("src/utils/date.ts:formatDate");
		});

		it("does not include non-exported symbols from target file", () => {
			const project = createProject();

			const handlerFile = project.createSourceFile(
				"handler.ts",
				`
import { formatDate } from './utils';

export const process = () => formatDate(new Date());
				`,
			);

			project.createSourceFile(
				"utils.ts",
				`
const helper = () => {};
export const formatDate = (d: Date) => d.toISOString();
				`,
			);

			// helper is not exported
			const nodes: Node[] = [
				{ ...createNode("utils.ts", "helper"), exported: false },
				createNode("utils.ts", "formatDate"),
				createNode("handler.ts", "process"),
			];

			const map = buildSymbolMap(nodes, "handler.ts", handlerFile);

			// Only exported formatDate is available
			expect(map.get("formatDate")).toBe("utils.ts:formatDate");
			expect(map.has("helper")).toBe(false);
		});
	});
});
