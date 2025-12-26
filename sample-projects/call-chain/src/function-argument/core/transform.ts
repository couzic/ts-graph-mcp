import { validate } from "../utils/validate.js";

// Passes callback through to validate
export function transform(
  items: string[],
  callback: (value: string) => string,
): string[] {
  const trimmed = items.map((item) => item.trim());
  return validate(trimmed, callback);
}
