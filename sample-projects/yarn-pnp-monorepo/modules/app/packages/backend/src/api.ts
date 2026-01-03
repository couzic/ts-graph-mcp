import { type Config, validateThreshold } from "@app/shared";
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
 * This tests that ts-graph-mcp resolves Namespace.Symbol to the actual definition.
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
