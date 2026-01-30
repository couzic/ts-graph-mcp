/**
 * Split camelCase and PascalCase identifiers into words.
 * Also handles snake_case and kebab-case.
 *
 * @example
 * splitCamelCase('validateCart') // 'validate Cart'
 * splitCamelCase('XMLParser') // 'XML Parser'
 * splitCamelCase('validate_cart') // 'validate cart'
 * splitCamelCase('validate-cart') // 'validate cart'
 */
export const splitCamelCase = (identifier: string): string => {
  return (
    identifier
      // Insert space before uppercase letters (for PascalCase/camelCase)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      // Insert space before sequences of uppercase followed by lowercase (for XMLParser)
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      // Replace underscores and hyphens with spaces
      .replace(/[_-]/g, " ")
      // Collapse multiple spaces
      .replace(/\s+/g, " ")
      .trim()
  );
};
