import { describe, expect, it } from "vitest";
import { subgraphToMermaid } from "./SubgraphToMermaid.js";
import type {
	ClassNode,
	Edge,
	FileNode,
	FunctionNode,
	InterfaceNode,
	MethodNode,
	PropertyNode,
	Subgraph,
	TypeAliasNode,
	VariableNode,
} from "./Types.js";

// Helper to create nodes
const createFunctionNode = (name: string, id?: string): FunctionNode => ({
	id: id ?? `test.ts:${name}`,
	type: "Function",
	name,
	module: "test",
	package: "test",
	filePath: "test.ts",
	startLine: 1,
	endLine: 10,
	exported: true,
});

const createMethodNode = (name: string, id?: string): MethodNode => ({
	id: id ?? `test.ts:Class.${name}`,
	type: "Method",
	name,
	module: "test",
	package: "test",
	filePath: "test.ts",
	startLine: 1,
	endLine: 10,
	exported: true,
});

const createClassNode = (name: string, id?: string): ClassNode => ({
	id: id ?? `test.ts:${name}`,
	type: "Class",
	name,
	module: "test",
	package: "test",
	filePath: "test.ts",
	startLine: 1,
	endLine: 10,
	exported: true,
});

const createInterfaceNode = (name: string, id?: string): InterfaceNode => ({
	id: id ?? `test.ts:${name}`,
	type: "Interface",
	name,
	module: "test",
	package: "test",
	filePath: "test.ts",
	startLine: 1,
	endLine: 10,
	exported: true,
});

const createTypeAliasNode = (name: string, id?: string): TypeAliasNode => ({
	id: id ?? `test.ts:${name}`,
	type: "TypeAlias",
	name,
	module: "test",
	package: "test",
	filePath: "test.ts",
	startLine: 1,
	endLine: 10,
	exported: true,
});

const createVariableNode = (name: string, id?: string): VariableNode => ({
	id: id ?? `test.ts:${name}`,
	type: "Variable",
	name,
	module: "test",
	package: "test",
	filePath: "test.ts",
	startLine: 1,
	endLine: 10,
	exported: true,
});

const createFileNode = (name: string, id?: string): FileNode => ({
	id: id ?? name,
	type: "File",
	name,
	module: "test",
	package: "test",
	filePath: name,
	startLine: 1,
	endLine: 100,
	exported: false,
});

const createPropertyNode = (name: string, id?: string): PropertyNode => ({
	id: id ?? `test.ts:Interface.${name}`,
	type: "Property",
	name,
	module: "test",
	package: "test",
	filePath: "test.ts",
	startLine: 1,
	endLine: 1,
	exported: false,
});

const createSubgraph = (
	center: FunctionNode | MethodNode | ClassNode | InterfaceNode,
	nodes: (
		| FunctionNode
		| MethodNode
		| ClassNode
		| InterfaceNode
		| TypeAliasNode
		| VariableNode
		| FileNode
		| PropertyNode
	)[],
	edges: Edge[],
): Subgraph => ({
	center,
	nodes,
	edges,
});

describe("subgraphToMermaid", () => {
	describe("Node Formatting", () => {
		it("formats Function node with parentheses", () => {
			const center = createFunctionNode("createOrder");
			const subgraph = createSubgraph(center, [center], []);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain('["createOrder()"]');
		});

		it("formats Method node with parentheses", () => {
			const center = createMethodNode("validate");
			const subgraph = createSubgraph(center, [center], []);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain('["validate()"]');
		});

		it("formats Class node without parentheses", () => {
			const center = createClassNode("UserService");
			const subgraph = createSubgraph(center, [center], []);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain('["UserService"]');
			expect(result).not.toContain("UserService()");
		});

		it("formats Interface node without parentheses", () => {
			const center = createInterfaceNode("User");
			const subgraph = createSubgraph(center, [center], []);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain('["User"]');
			expect(result).not.toContain("User()");
		});

		it("formats TypeAlias node without parentheses", () => {
			const center = createFunctionNode("main");
			const typeAlias = createTypeAliasNode("UserId");
			const subgraph = createSubgraph(center, [center, typeAlias], []);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain('["UserId"]');
			expect(result).not.toContain("UserId()");
		});

		it("formats Variable node without parentheses", () => {
			const center = createFunctionNode("main");
			const variable = createVariableNode("config");
			const subgraph = createSubgraph(center, [center, variable], []);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain('["config"]');
			expect(result).not.toContain("config()");
		});

		it("formats File node without parentheses", () => {
			const center = createFunctionNode("main");
			const file = createFileNode("utils.ts");
			const subgraph = createSubgraph(center, [center, file], []);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain('["utils.ts"]');
			expect(result).not.toContain("utils.ts()");
		});

		it("formats Property node without parentheses", () => {
			const center = createFunctionNode("main");
			const property = createPropertyNode("email");
			const subgraph = createSubgraph(center, [center, property], []);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain('["email"]');
			expect(result).not.toContain("email()");
		});
	});

	describe("Edge Label Formatting", () => {
		it('formats CALLS edge as "calls"', () => {
			const fn1 = createFunctionNode("caller", "test.ts:caller");
			const fn2 = createFunctionNode("callee", "test.ts:callee");
			const edge: Edge = { source: fn1.id, target: fn2.id, type: "CALLS" };
			const subgraph = createSubgraph(fn1, [fn1, fn2], [edge]);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain("-->|calls|");
		});

		it('formats IMPORTS edge as "imports"', () => {
			const file1 = createFileNode("a.ts", "a.ts");
			const file2 = createFileNode("b.ts", "b.ts");
			const center = createFunctionNode("main");
			const edge: Edge = {
				source: file1.id,
				target: file2.id,
				type: "IMPORTS",
			};
			const subgraph = createSubgraph(center, [center, file1, file2], [edge]);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain("-->|imports|");
		});

		it('formats CONTAINS edge as "contains"', () => {
			const file = createFileNode("a.ts", "a.ts");
			const fn = createFunctionNode("myFunc", "a.ts:myFunc");
			const edge: Edge = { source: file.id, target: fn.id, type: "CONTAINS" };
			const subgraph = createSubgraph(fn, [fn, file], [edge]);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain("-->|contains|");
		});

		it('formats IMPLEMENTS edge as "implements"', () => {
			const cls = createClassNode("UserService", "test.ts:UserService");
			const iface = createInterfaceNode("IService", "test.ts:IService");
			const edge: Edge = {
				source: cls.id,
				target: iface.id,
				type: "IMPLEMENTS",
			};
			const subgraph = createSubgraph(cls, [cls, iface], [edge]);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain("-->|implements|");
		});

		it('formats EXTENDS edge as "extends"', () => {
			const child = createClassNode("Child", "test.ts:Child");
			const parent = createClassNode("Parent", "test.ts:Parent");
			const edge: Edge = {
				source: child.id,
				target: parent.id,
				type: "EXTENDS",
			};
			const subgraph = createSubgraph(child, [child, parent], [edge]);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain("-->|extends|");
		});

		it('formats USES_TYPE edge as "uses type"', () => {
			const fn = createFunctionNode("getUser", "test.ts:getUser");
			const iface = createInterfaceNode("User", "test.ts:User");
			const edge: Edge = { source: fn.id, target: iface.id, type: "USES_TYPE" };
			const subgraph = createSubgraph(fn, [fn, iface], [edge]);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain("-->|uses type|");
		});

		it('formats READS_PROPERTY edge as "reads"', () => {
			const fn = createFunctionNode("getName", "test.ts:getName");
			const prop = createPropertyNode("name", "test.ts:User.name");
			const edge: Edge = {
				source: fn.id,
				target: prop.id,
				type: "READS_PROPERTY",
			};
			const subgraph = createSubgraph(fn, [fn, prop], [edge]);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain("-->|reads|");
		});

		it('formats WRITES_PROPERTY edge as "writes"', () => {
			const fn = createFunctionNode("setName", "test.ts:setName");
			const prop = createPropertyNode("name", "test.ts:User.name");
			const edge: Edge = {
				source: fn.id,
				target: prop.id,
				type: "WRITES_PROPERTY",
			};
			const subgraph = createSubgraph(fn, [fn, prop], [edge]);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain("-->|writes|");
		});
	});

	describe("Graph Direction", () => {
		it("uses left-to-right direction with LR option", () => {
			const center = createFunctionNode("main");
			const subgraph = createSubgraph(center, [center], []);
			const result = subgraphToMermaid(subgraph, { direction: "LR" });
			expect(result).toMatch(/^graph LR/);
		});

		it("uses top-down direction with TD option", () => {
			const center = createFunctionNode("main");
			const subgraph = createSubgraph(center, [center], []);
			const result = subgraphToMermaid(subgraph, { direction: "TD" });
			expect(result).toMatch(/^graph TD/);
		});

		it("defaults to left-to-right when no option provided", () => {
			const center = createFunctionNode("main");
			const subgraph = createSubgraph(center, [center], []);
			const result = subgraphToMermaid(subgraph);
			expect(result).toMatch(/^graph LR/);
		});
	});

	describe("Empty and Minimal Graphs", () => {
		it("handles center node only (no neighbors)", () => {
			const center = createFunctionNode("lonely");
			const subgraph = createSubgraph(center, [center], []);
			const result = subgraphToMermaid(subgraph);
			expect(result).toContain("graph LR");
			expect(result).toContain('["lonely()"]');
			expect(result.split("\n").length).toBe(2); // graph line + 1 node
		});

		it("handles single edge between two nodes", () => {
			const fn1 = createFunctionNode("a", "test.ts:a");
			const fn2 = createFunctionNode("b", "test.ts:b");
			const edge: Edge = { source: fn1.id, target: fn2.id, type: "CALLS" };
			const subgraph = createSubgraph(fn1, [fn1, fn2], [edge]);
			const result = subgraphToMermaid(subgraph);
			const lines = result.split("\n");
			expect(lines.length).toBe(4); // graph + 2 nodes + 1 edge
		});

		it("handles multiple nodes with no edges", () => {
			const fn1 = createFunctionNode("a", "test.ts:a");
			const fn2 = createFunctionNode("b", "test.ts:b");
			const fn3 = createFunctionNode("c", "test.ts:c");
			const subgraph = createSubgraph(fn1, [fn1, fn2, fn3], []);
			const result = subgraphToMermaid(subgraph);
			const lines = result.split("\n");
			expect(lines.length).toBe(4); // graph + 3 nodes
			expect(result).not.toContain("-->");
		});
	});

	describe("Complete Graph Structure", () => {
		it("renders full graph with mixed node types and edges", () => {
			const handleRequest = createFunctionNode(
				"handleRequest",
				"api.ts:handleRequest",
			);
			const validateInput = createFunctionNode(
				"validateInput",
				"api.ts:validateInput",
			);
			const Request = createInterfaceNode("Request", "types.ts:Request");
			const Logger = createClassNode("Logger", "utils.ts:Logger");

			const edges: Edge[] = [
				{ source: handleRequest.id, target: validateInput.id, type: "CALLS" },
				{ source: handleRequest.id, target: Request.id, type: "USES_TYPE" },
				{ source: handleRequest.id, target: Logger.id, type: "CALLS" },
			];

			const subgraph = createSubgraph(
				handleRequest,
				[handleRequest, validateInput, Request, Logger],
				edges,
			);

			const result = subgraphToMermaid(subgraph);

			// Check structure
			expect(result).toMatch(/^graph LR/);
			expect(result).toContain('["handleRequest()"]');
			expect(result).toContain('["validateInput()"]');
			expect(result).toContain('["Request"]');
			expect(result).toContain('["Logger"]');
			expect(result).toContain("-->|calls|");
			expect(result).toContain("-->|uses type|");

			// Check node IDs are sequential (n0, n1, etc.)
			expect(result).toMatch(/n0\[/);
			expect(result).toMatch(/n1\[/);
			expect(result).toMatch(/n2\[/);
			expect(result).toMatch(/n3\[/);
		});

		it("uses stable node ID mapping for edges", () => {
			const fn1 = createFunctionNode("first", "test.ts:first");
			const fn2 = createFunctionNode("second", "test.ts:second");
			const edge: Edge = { source: fn1.id, target: fn2.id, type: "CALLS" };
			const subgraph = createSubgraph(fn1, [fn1, fn2], [edge]);

			const result = subgraphToMermaid(subgraph);

			// fn1 should be n0, fn2 should be n1
			expect(result).toContain('n0["first()"]');
			expect(result).toContain('n1["second()"]');
			expect(result).toContain("n0 -->|calls| n1");
		});
	});
});
