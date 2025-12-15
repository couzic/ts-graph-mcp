import { helper } from "./helper.js";

// This function calls helper, and is itself called from main.ts
// Tests transitive cross-file calls
export function intermediate(): string {
	return helper().toLowerCase();
}
