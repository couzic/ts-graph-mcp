import { helper } from "./helper.js";
import { intermediate } from "./chained.js";

// This function calls an imported function from another file
// The CALLS edge should be: main.ts:caller → helper.ts:helper
export function caller(): string {
	return helper();
}

// This function calls helper multiple times - tests callCount
export function multiCaller(): string {
	const a = helper();
	const b = helper();
	return a + b;
}

// Another caller of helper - tests multiple callers to same target
export function anotherCaller(): string {
	return helper().toUpperCase();
}

// Tests transitive cross-file calls: chain → intermediate → helper
export function chain(): string {
	return intermediate();
}
