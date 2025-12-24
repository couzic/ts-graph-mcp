/**
 * Demonstrates array element and Map storage references.
 * Pattern: [fn1, fn2], map.set('key', fn)
 *
 * Expected REFERENCES edges:
 * - validators → validateInput (array element)
 * - registerHandlers → handleCreate (Map value)
 * - registerHandlers → handleRead (Map value)
 */

import { validateInput, formatOutput, handleCreate, handleRead } from "./handlers.js";

type Validator = (input: unknown) => boolean;
type Handler = (...args: unknown[]) => void;

// Functions stored in array (not directly called)
export const validators: Validator[] = [validateInput];

// Functions stored in Map (not directly called)
const handlerMap = new Map<string, Handler>();

export function registerHandlers(): void {
	handlerMap.set("create", handleCreate);
	handlerMap.set("read", handleRead as unknown as Handler);
}

// Exported for reference (array literal)
export const formatters = [formatOutput];
