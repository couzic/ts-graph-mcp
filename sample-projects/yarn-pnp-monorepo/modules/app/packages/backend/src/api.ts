import { type Config, validateThreshold } from "@app/shared";
import { formatError } from "@libs/error-utils";
import { toUpperCase } from "@libs/text-utils";
import { MathUtils, StringUtils } from "@libs/toolkit";

export function handleConfigUpdate(input: unknown): Config {
  const config = input as Config;
  return {
    ...config,
    threshold: validateThreshold(config.threshold),
  };
}

/**
 * Uses namespace import pattern: MathUtils.multiply
 * This tests that ts-graph resolves Namespace.Symbol to the actual definition.
 */
export function calculateArea(width: number, height: number): number {
  return MathUtils.multiply(width, height);
}

/**
 * Uses namespace import with path alias: StringUtils.capitalize
 * The barrel file exports StringUtils from "@/strings" (path alias).
 */
export function formatLabel(label: string): string {
  return StringUtils.capitalize(label);
}

/**
 * Tests cross-package edge resolution.
 * toUpperCase comes from text-utils (types: null, export * from)
 * formatError comes from error-utils (types: dist/index.d.ts, export { x } from)
 */
export function processInput(input: string): string {
  const upper = toUpperCase(input);
  const error = formatError(new Error("test"));
  return `${upper} - ${error}`;
}
