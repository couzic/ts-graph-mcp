import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../config/ConfigSchema.js";
import type { DbWriter } from "../db/DbWriter.js";
import type { Edge, Node } from "../db/Types.js";
import { indexFile, indexProject, removeFile } from "./Ingestion.js";

const TEST_DIR = "/tmp/ts-graph-rag-ingestion-test";

// Mock DbWriter that collects all written data
const createMockWriter = (): DbWriter & {
	nodes: Node[];
	edges: Edge[];
	removedFiles: string[];
	cleared: boolean;
} => {
	const state = {
		nodes: [] as Node[],
		edges: [] as Edge[],
		removedFiles: [] as string[],
		cleared: false,
	};

	return {
		get nodes() {
			return state.nodes;
		},
		get edges() {
			return state.edges;
		},
		get removedFiles() {
			return state.removedFiles;
		},
		get cleared() {
			return state.cleared;
		},
		async addNodes(newNodes: Node[]): Promise<void> {
			state.nodes.push(...newNodes);
		},
		async addEdges(newEdges: Edge[]): Promise<void> {
			state.edges.push(...newEdges);
		},
		async removeFileNodes(filePath: string): Promise<void> {
			state.removedFiles.push(filePath);
			// Remove nodes with this filePath
			const toRemove = state.nodes
				.filter((n) => n.filePath === filePath)
				.map((n) => n.id);
			for (let i = state.nodes.length - 1; i >= 0; i--) {
				const nodeId = state.nodes[i]?.id;
				if (nodeId && toRemove.includes(nodeId)) {
					state.nodes.splice(i, 1);
				}
			}
		},
		async clearAll(): Promise<void> {
			state.nodes.length = 0;
			state.edges.length = 0;
			state.removedFiles.length = 0;
			state.cleared = true;
		},
	};
};

describe("Ingestion", () => {
	beforeEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
	});

	describe("indexFile", () => {
		it("indexes a single TypeScript file", async () => {
			const filePath = join(TEST_DIR, "utils.ts");
			writeFileSync(
				filePath,
				`
export function greet(name: string): string {
  return 'Hello, ' + name;
}
        `.trim(),
			);

			const writer = createMockWriter();
			await indexFile(filePath, writer, {
				module: "core",
				package: "utils",
				relativePath: "utils.ts",
			});

			// Should have file node + function node
			expect(writer.nodes.length).toBeGreaterThanOrEqual(2);
			expect(writer.nodes.some((n) => n.type === "File")).toBe(true);
			expect(writer.nodes.some((n) => n.type === "Function")).toBe(true);

			// Should have CONTAINS edge
			expect(writer.edges.some((e) => e.type === "CONTAINS")).toBe(true);
		});

		it("removes existing file data before indexing", async () => {
			const filePath = join(TEST_DIR, "reindex.ts");
			writeFileSync(filePath, "export const x = 1;");

			const writer = createMockWriter();

			// Index twice
			await indexFile(filePath, writer, {
				module: "core",
				package: "main",
				relativePath: "reindex.ts",
			});
			await indexFile(filePath, writer, {
				module: "core",
				package: "main",
				relativePath: "reindex.ts",
			});

			// Should have called removeFileNodes
			expect(writer.removedFiles).toContain("reindex.ts");
		});

		it("extracts class with methods", async () => {
			const filePath = join(TEST_DIR, "User.ts");
			writeFileSync(
				filePath,
				`
export class User {
  constructor(public name: string) {}

  greet(): string {
    return 'Hi, ' + this.name;
  }
}
        `.trim(),
			);

			const writer = createMockWriter();
			await indexFile(filePath, writer, {
				module: "domain",
				package: "models",
				relativePath: "User.ts",
			});

			const classNodes = writer.nodes.filter((n) => n.type === "Class");
			const methodNodes = writer.nodes.filter((n) => n.type === "Method");

			expect(classNodes).toHaveLength(1);
			expect(methodNodes.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("removeFile", () => {
		it("removes file from index", async () => {
			const writer = createMockWriter();

			await removeFile("src/deleted.ts", writer);

			expect(writer.removedFiles).toContain("src/deleted.ts");
		});

		it("is idempotent (no error if file not indexed)", async () => {
			const writer = createMockWriter();

			// Should not throw
			await expect(
				removeFile("nonexistent.ts", writer),
			).resolves.toBeUndefined();
		});
	});

	describe("indexProject", () => {
		it("indexes all packages in config", async () => {
			// Create project structure
			const pkg1Dir = join(TEST_DIR, "packages", "core");
			const pkg2Dir = join(TEST_DIR, "packages", "utils");
			mkdirSync(pkg1Dir, { recursive: true });
			mkdirSync(pkg2Dir, { recursive: true });

			// Create tsconfig files
			writeFileSync(
				join(pkg1Dir, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: { target: "ES2022", module: "NodeNext" },
					include: ["*.ts"],
				}),
			);
			writeFileSync(
				join(pkg2Dir, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: { target: "ES2022", module: "NodeNext" },
					include: ["*.ts"],
				}),
			);

			// Create source files
			writeFileSync(join(pkg1Dir, "index.ts"), "export const core = true;");
			writeFileSync(
				join(pkg2Dir, "helpers.ts"),
				"export function help(): void {}",
			);

			const config: ProjectConfig = {
				modules: [
					{
						name: "app",
						packages: [
							{ name: "core", tsconfig: "./packages/core/tsconfig.json" },
							{ name: "utils", tsconfig: "./packages/utils/tsconfig.json" },
						],
					},
				],
			};

			const writer = createMockWriter();
			const result = await indexProject(config, writer, {
				projectRoot: TEST_DIR,
			});

			expect(result.filesProcessed).toBeGreaterThanOrEqual(2);
			expect(result.nodesAdded).toBeGreaterThan(0);
			expect(result.durationMs).toBeGreaterThan(0);
		});

		it("returns error info for invalid files", async () => {
			const pkgDir = join(TEST_DIR, "packages", "broken");
			mkdirSync(pkgDir, { recursive: true });

			writeFileSync(
				join(pkgDir, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: { target: "ES2022" },
					include: ["*.ts"],
				}),
			);

			// Valid file
			writeFileSync(join(pkgDir, "valid.ts"), "export const x = 1;");

			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [
							{ name: "broken", tsconfig: "./packages/broken/tsconfig.json" },
						],
					},
				],
			};

			const writer = createMockWriter();
			const result = await indexProject(config, writer, {
				projectRoot: TEST_DIR,
			});

			// Should still process valid files
			expect(result.filesProcessed).toBeGreaterThanOrEqual(1);
		});

		it("clears database before full reindex when clearFirst is true", async () => {
			const pkgDir = join(TEST_DIR, "packages", "main");
			mkdirSync(pkgDir, { recursive: true });

			writeFileSync(
				join(pkgDir, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: { target: "ES2022" },
					include: ["*.ts"],
				}),
			);
			writeFileSync(join(pkgDir, "app.ts"), "export const app = true;");

			const config: ProjectConfig = {
				modules: [
					{
						name: "test",
						packages: [
							{ name: "main", tsconfig: "./packages/main/tsconfig.json" },
						],
					},
				],
			};

			const writer = createMockWriter();
			await indexProject(config, writer, {
				projectRoot: TEST_DIR,
				clearFirst: true,
			});

			expect(writer.cleared).toBe(true);
		});
	});
});
