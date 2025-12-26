import { transform } from "../core/transform.js";

// Passes callback through to transform
export function orchestrate(
  items: string[],
  callback: (value: string) => string,
): string[] {
  return transform(items, callback);
}
