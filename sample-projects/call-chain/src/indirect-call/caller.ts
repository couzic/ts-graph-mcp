import { target } from "./target.js";

// Store function in variable, then call
export function caller(): string {
	const fn = target;
	return fn();
}
