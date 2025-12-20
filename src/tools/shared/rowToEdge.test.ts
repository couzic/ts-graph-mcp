import { describe, expect, it } from "vitest";
import type { EdgeRow } from "./QueryTypes.js";
import { rowToEdge } from "./rowConverters.js";

describe(rowToEdge.name, () => {
	it("converts basic edge with source, target, and type only", () => {
		const row: EdgeRow = {
			source: "src/utils.ts:formatDate",
			target: "src/models/User.ts:User.name",
			type: "READS_PROPERTY",
			call_count: null,
			is_type_only: null,
			imported_symbols: null,
			context: null,
		};

		const edge = rowToEdge(row);

		expect(edge).toEqual({
			source: "src/utils.ts:formatDate",
			target: "src/models/User.ts:User.name",
			type: "READS_PROPERTY",
		});
		expect(edge).not.toHaveProperty("callCount");
		expect(edge).not.toHaveProperty("isTypeOnly");
		expect(edge).not.toHaveProperty("importedSymbols");
		expect(edge).not.toHaveProperty("context");
	});

	it("converts CALLS edge with call_count", () => {
		const row: EdgeRow = {
			source: "src/api/handler.ts:createUser",
			target: "src/db/user.ts:saveUser",
			type: "CALLS",
			call_count: 3,
			is_type_only: null,
			imported_symbols: null,
			context: null,
		};

		const edge = rowToEdge(row);

		expect(edge.callCount).toBe(3);
	});

	it("includes call_count of 0 (falsy but not null)", () => {
		const row: EdgeRow = {
			source: "src/foo.ts:bar",
			target: "src/baz.ts:qux",
			type: "CALLS",
			call_count: 0,
			is_type_only: null,
			imported_symbols: null,
			context: null,
		};

		const edge = rowToEdge(row);

		expect(edge.callCount).toBe(0);
	});

	it("converts is_type_only=1 to isTypeOnly=true", () => {
		const row: EdgeRow = {
			source: "src/api/handler.ts",
			target: "src/types/User.ts",
			type: "IMPORTS",
			call_count: null,
			is_type_only: 1,
			imported_symbols: null,
			context: null,
		};

		const edge = rowToEdge(row);

		expect(edge.isTypeOnly).toBe(true);
	});

	it("converts is_type_only=0 to isTypeOnly=false", () => {
		const row: EdgeRow = {
			source: "src/api/handler.ts",
			target: "src/utils/validate.ts",
			type: "IMPORTS",
			call_count: null,
			is_type_only: 0,
			imported_symbols: null,
			context: null,
		};

		const edge = rowToEdge(row);

		expect(edge.isTypeOnly).toBe(false);
	});

	it("parses imported_symbols JSON array", () => {
		const row: EdgeRow = {
			source: "src/index.ts",
			target: "src/utils.ts",
			type: "IMPORTS",
			call_count: null,
			is_type_only: null,
			imported_symbols: '["formatDate", "parseDate", "validateDate"]',
			context: null,
		};

		const edge = rowToEdge(row);

		expect(edge.importedSymbols).toEqual([
			"formatDate",
			"parseDate",
			"validateDate",
		]);
	});

	it("includes context field when present", () => {
		const row: EdgeRow = {
			source: "src/api/handler.ts:createUser",
			target: "src/types/User.ts:User",
			type: "USES_TYPE",
			call_count: null,
			is_type_only: null,
			imported_symbols: null,
			context: "parameter",
		};

		const edge = rowToEdge(row);

		expect(edge.context).toBe("parameter");
	});

	it("omits optional fields when all are null", () => {
		const row: EdgeRow = {
			source: "src/a.ts",
			target: "src/b.ts",
			type: "CONTAINS",
			call_count: null,
			is_type_only: null,
			imported_symbols: null,
			context: null,
		};

		const edge = rowToEdge(row);

		const keys = Object.keys(edge);
		expect(keys).toEqual(["source", "target", "type"]);
	});
});
