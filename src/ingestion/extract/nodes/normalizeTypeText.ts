/**
 * Normalize type text by collapsing whitespace (newlines, tabs, multiple spaces)
 * into single spaces. This makes types more LLM-friendly and token-efficient.
 *
 * @example
 * normalizeTypeText("{\n\tname: string;\n}") // "{ name: string; }"
 * normalizeTypeText("string | number") // "string | number"
 * normalizeTypeText(undefined) // undefined
 */
export const normalizeTypeText = (
  text: string | undefined,
): string | undefined => {
  if (text === undefined) return undefined;
  return text.replace(/\s+/g, " ").trim();
};
