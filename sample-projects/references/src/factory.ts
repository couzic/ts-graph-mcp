/**
 * Demonstrates return value references.
 * Pattern: return fn, factory functions
 *
 * Expected REFERENCES edges:
 * - getErrorHandler → logError (return value)
 * - createProcessor → transformItem (return value)
 */

import { logError, transformItem } from "./handlers.js";

type ErrorHandler = (error: Error) => void;
type Processor = (item: string) => string;

// Factory returns a function reference (not a direct call)
export function getErrorHandler(): ErrorHandler {
	return logError;
}

// Factory that returns the handler
export function createProcessor(): Processor {
	return transformItem;
}
