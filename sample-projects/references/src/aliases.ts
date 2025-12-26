/**
 * Demonstrates variable assignment references.
 * Pattern: const x = fn
 *
 * Expected REFERENCES edges:
 * - validate → validateInput (variable assignment)
 * - format → formatOutput (variable assignment)
 */

import { formatOutput, validateInput } from "./handlers.js";

// Function assigned to variable (not directly called here)
export const validate = validateInput;
export const format = formatOutput;

// Re-export under different name
export { logError as handleError } from "./handlers.js";
