import { step02 } from "./step02.js";

// Entry point of the 10-step call chain
// Tests deep transitive traversal across files
export function entry(): string {
	return step02() + "-01";
}
