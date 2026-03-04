/**
 * Split camelCase and PascalCase identifiers into words.
 * Also handles snake_case and kebab-case.
 *
 * @spec search::preprocessing.camel-case
 * @spec search::preprocessing.pascal-case
 * @spec search::preprocessing.acronym
 * @spec search::preprocessing.snake-case
 * @spec search::preprocessing.kebab-case
 * @spec search::preprocessing.single-word
 * @spec search.lexical::camelcase-splitting
 * @spec search.lexical::pascalcase-splitting
 * @spec search.lexical::acronym-splitting
 * @spec search.lexical::snake-case-splitting
 * @spec search.lexical::kebab-case-splitting
 * @spec search.lexical::mixed-case-splitting
 * @spec search.lexical::single-word-identity
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
