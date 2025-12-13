import { helper } from "./helper.js";

// This function calls an imported function from another file
// The CALLS edge should be: main.ts:caller → helper.ts:helper
export function caller(): string {
  return helper();
}
