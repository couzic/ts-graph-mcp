import { describe, expect, it } from "vitest";
import { normalizeTypeText } from "./normalizeTypeText.js";

describe(normalizeTypeText.name, () => {
	describe("undefined handling", () => {
		it("returns undefined when input is undefined", () => {
			expect(normalizeTypeText(undefined)).toBeUndefined();
		});
	});

	describe("passthrough for simple types", () => {
		it("preserves simple primitive types", () => {
			expect(normalizeTypeText("string")).toBe("string");
			expect(normalizeTypeText("number")).toBe("number");
			expect(normalizeTypeText("boolean")).toBe("boolean");
		});

		it("preserves single-line object types", () => {
			expect(normalizeTypeText("{ name: string }")).toBe("{ name: string }");
		});

		it("preserves array types", () => {
			expect(normalizeTypeText("string[]")).toBe("string[]");
			expect(normalizeTypeText("Array<number>")).toBe("Array<number>");
		});

		it("preserves union types on single line", () => {
			expect(normalizeTypeText("string | number")).toBe("string | number");
		});
	});

	describe("whitespace normalization", () => {
		it("collapses newlines to single space", () => {
			expect(normalizeTypeText("{\nname: string;\n}")).toBe(
				"{ name: string; }",
			);
		});

		it("collapses tabs to single space", () => {
			expect(normalizeTypeText("{\tname: string;\t}")).toBe(
				"{ name: string; }",
			);
		});

		it("collapses mixed whitespace to single space", () => {
			expect(normalizeTypeText("{\n\tname: string;\n\t}")).toBe(
				"{ name: string; }",
			);
		});

		it("collapses multiple spaces to single space", () => {
			expect(normalizeTypeText("{   name:   string;   }")).toBe(
				"{ name: string; }",
			);
		});

		it("trims leading whitespace", () => {
			expect(normalizeTypeText("  string")).toBe("string");
			expect(normalizeTypeText("\n\tstring")).toBe("string");
		});

		it("trims trailing whitespace", () => {
			expect(normalizeTypeText("string  ")).toBe("string");
			expect(normalizeTypeText("string\n\t")).toBe("string");
		});
	});

	describe("complex multiline types", () => {
		it("normalizes multiline object type", () => {
			const input = `{
	name: string;
	value: number;
	nested: {
		deep: boolean;
	};
}`;
			expect(normalizeTypeText(input)).toBe(
				"{ name: string; value: number; nested: { deep: boolean; }; }",
			);
		});

		it("normalizes multiline union type", () => {
			const input = `| string
	| number
	| { type: "special"; data: unknown }`;
			expect(normalizeTypeText(input)).toBe(
				'| string | number | { type: "special"; data: unknown }',
			);
		});

		it("normalizes multiline intersection type", () => {
			const input = `BaseType
	& { extra: string }
	& { more: number }`;
			expect(normalizeTypeText(input)).toBe(
				"BaseType & { extra: string } & { more: number }",
			);
		});

		it("normalizes multiline function type", () => {
			const input = `(
	name: string,
	options: {
		timeout: number;
	}
) => Promise<void>`;
			expect(normalizeTypeText(input)).toBe(
				"( name: string, options: { timeout: number; } ) => Promise<void>",
			);
		});

		it("normalizes multiline generic type", () => {
			const input = `Map<
	string,
	{
		id: number;
		data: unknown;
	}
>`;
			expect(normalizeTypeText(input)).toBe(
				"Map< string, { id: number; data: unknown; } >",
			);
		});

		it("normalizes deeply nested multiline type", () => {
			const input = `{
	level1: {
		level2: {
			level3: {
				value: string;
			};
		};
	};
}`;
			expect(normalizeTypeText(input)).toBe(
				"{ level1: { level2: { level3: { value: string; }; }; }; }",
			);
		});
	});

	describe("edge cases", () => {
		it("handles empty string", () => {
			expect(normalizeTypeText("")).toBe("");
		});

		it("handles whitespace-only string", () => {
			expect(normalizeTypeText("   \n\t  ")).toBe("");
		});

		it("preserves string literals with spaces", () => {
			expect(normalizeTypeText('"hello world"')).toBe('"hello world"');
		});

		it("handles type with template literal", () => {
			// biome-ignore lint/suspicious/noTemplateCurlyInString: testing TS template literal type syntax
			const templateLiteralType = "`prefix-${string}`";
			expect(normalizeTypeText(templateLiteralType)).toBe(templateLiteralType);
		});
	});
});
