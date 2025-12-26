import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { queryEdges } from "./queryEdges.js";
import { createSqliteWriter } from "./sqlite/createSqliteWriter.js";
import {
	closeDatabase,
	openDatabase,
} from "./sqlite/sqliteConnection.utils.js";
import { initializeSchema } from "./sqlite/sqliteSchema.utils.js";
import type { Edge } from "./Types.js";

describe.skip(queryEdges.name, () => {
	let db: Database.Database;

	beforeEach(() => {
		db = openDatabase({ path: ":memory:" });
		initializeSchema(db);
	});

	afterEach(() => {
		closeDatabase(db);
	});

	const setupEdges = async (edges: Edge[]) => {
		const writer = createSqliteWriter(db);
		await writer.addEdges(edges);
	};

	it("returns all edges when no filters provided", async () => {
		await setupEdges([
			{ source: "a", target: "b", type: "CALLS" },
			{ source: "b", target: "c", type: "IMPORTS" },
		]);

		const result = queryEdges(db);

		expect(result).toHaveLength(2);
	});

	it("filters by single edge type", async () => {
		await setupEdges([
			{ source: "a", target: "b", type: "CALLS" },
			{ source: "b", target: "c", type: "IMPORTS" },
			{ source: "c", target: "d", type: "CALLS" },
		]);

		const result = queryEdges(db, { type: "CALLS" });

		expect(result).toHaveLength(2);
		expect(result.every((e) => e.type === "CALLS")).toBe(true);
	});

	it("filters by multiple edge types", async () => {
		await setupEdges([
			{ source: "a", target: "b", type: "CALLS" },
			{ source: "b", target: "c", type: "IMPORTS" },
			{ source: "c", target: "d", type: "USES_TYPE" },
		]);

		const result = queryEdges(db, { type: ["CALLS", "IMPORTS"] });

		expect(result).toHaveLength(2);
		expect(result.map((e) => e.type).sort()).toEqual(["CALLS", "IMPORTS"]);
	});

	it("filters by source pattern with glob", async () => {
		await setupEdges([
			{ source: "src/utils.ts:formatDate", target: "x", type: "CALLS" },
			{ source: "src/utils.ts:formatTime", target: "y", type: "CALLS" },
			{ source: "src/api.ts:getUser", target: "z", type: "CALLS" },
		]);

		const result = queryEdges(db, { sourcePattern: "*format*" });

		expect(result).toHaveLength(2);
		expect(result.every((e) => e.source.includes("format"))).toBe(true);
	});

	it("filters by target pattern with glob", async () => {
		await setupEdges([
			{ source: "a", target: "src/types.ts:User", type: "USES_TYPE" },
			{ source: "b", target: "src/types.ts:Config", type: "USES_TYPE" },
			{ source: "c", target: "src/types.ts:UserSettings", type: "USES_TYPE" },
		]);

		const result = queryEdges(db, { targetPattern: "*User" });

		expect(result).toHaveLength(1);
		expect(result[0]?.target).toBe("src/types.ts:User");
	});

	it("filters by exact sourceId", async () => {
		await setupEdges([
			{ source: "src/api.ts:getUser", target: "x", type: "CALLS" },
			{ source: "src/api.ts:getUsers", target: "y", type: "CALLS" },
		]);

		const result = queryEdges(db, { sourceId: "src/api.ts:getUser" });

		expect(result).toHaveLength(1);
		expect(result[0]?.source).toBe("src/api.ts:getUser");
	});

	it("filters by exact targetId", async () => {
		await setupEdges([
			{ source: "a", target: "src/types.ts:User", type: "USES_TYPE" },
			{ source: "b", target: "src/types.ts:Config", type: "USES_TYPE" },
		]);

		const result = queryEdges(db, { targetId: "src/types.ts:User" });

		expect(result).toHaveLength(1);
		expect(result[0]?.target).toBe("src/types.ts:User");
	});

	it("filters by context", async () => {
		await setupEdges([
			{ source: "a", target: "x", type: "USES_TYPE", context: "parameter" },
			{ source: "b", target: "y", type: "USES_TYPE", context: "return" },
			{ source: "c", target: "z", type: "USES_TYPE", context: "parameter" },
		]);

		const result = queryEdges(db, { context: "parameter" });

		expect(result).toHaveLength(2);
		expect(result.every((e) => e.context === "parameter")).toBe(true);
	});

	it("combines multiple filters with AND logic", async () => {
		await setupEdges([
			{
				source: "src/api.ts:formatUser",
				target: "src/types.ts:User",
				type: "USES_TYPE",
				context: "return",
			},
			{
				source: "src/api.ts:formatUser",
				target: "src/types.ts:Config",
				type: "USES_TYPE",
				context: "parameter",
			},
			{
				source: "src/utils.ts:formatDate",
				target: "src/types.ts:User",
				type: "USES_TYPE",
				context: "parameter",
			},
		]);

		const result = queryEdges(db, {
			type: "USES_TYPE",
			sourcePattern: "*formatUser*",
			targetPattern: "*User",
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.source).toBe("src/api.ts:formatUser");
		expect(result[0]?.target).toBe("src/types.ts:User");
	});

	it("preserves callCount metadata", async () => {
		await setupEdges([
			{ source: "a", target: "b", type: "CALLS", callCount: 5 },
		]);

		const result = queryEdges(db, { type: "CALLS" });

		expect(result[0]?.callCount).toBe(5);
	});

	it("preserves isTypeOnly metadata", async () => {
		await setupEdges([
			{ source: "a", target: "b", type: "IMPORTS", isTypeOnly: true },
		]);

		const result = queryEdges(db, { type: "IMPORTS" });

		expect(result[0]?.isTypeOnly).toBe(true);
	});

	it("preserves importedSymbols metadata", async () => {
		await setupEdges([
			{
				source: "a",
				target: "b",
				type: "IMPORTS",
				importedSymbols: ["User", "Config"],
			},
		]);

		const result = queryEdges(db, { type: "IMPORTS" });

		expect(result[0]?.importedSymbols).toEqual(["User", "Config"]);
	});

	it("returns empty array when no matches", async () => {
		await setupEdges([{ source: "a", target: "b", type: "CALLS" }]);

		const result = queryEdges(db, { type: "IMPORTS" });

		expect(result).toEqual([]);
	});
});
