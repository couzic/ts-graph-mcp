/**
 * Prepare content for embedding.
 * Includes metadata prefix and source snippet.
 *
 * @example
 * prepareEmbeddingContent("Function", "foo", "src/utils.ts", "function foo() {}") // "// Function: foo\n// File: src/utils.ts\n\nfunction foo() {}"
 */
export const prepareEmbeddingContent = (
  nodeType: string,
  name: string,
  filePath: string,
  sourceSnippet: string,
): string => {
  return `// ${nodeType}: ${name}
// File: ${filePath}

${sourceSnippet}`.trim();
};
