/**
 * Check if the text before a `{` indicates a method/function body.
 *
 * Patterns:
 * - `methodName()` - no return type
 * - `methodName(): Type` - with return type
 * - `() =>` - arrow function
 */
const isMethodSignature = (textBeforeBrace: string): boolean => {
  const trimmed = textBeforeBrace.trimEnd();

  // Arrow function: ends with =>
  if (trimmed.endsWith("=>")) {
    return true;
  }

  // No return type: ends with )
  if (trimmed.endsWith(")")) {
    return true;
  }

  // With return type: find ) followed by : and type
  // Work backwards to find the closing paren of the signature
  let i = trimmed.length - 1;
  let angleBracketDepth = 0;

  while (i >= 0) {
    const char = trimmed[i];

    if (char === ">") {
      angleBracketDepth++;
    } else if (char === "<") {
      angleBracketDepth--;
    } else if (angleBracketDepth === 0) {
      if (char === ":") {
        // Found the colon, check if preceded by )
        const beforeColon = trimmed.slice(0, i).trimEnd();
        if (beforeColon.endsWith(")")) {
          return true;
        }
      }
    }

    i--;
  }

  return false;
};

/**
 * Strip method implementations from a class, keeping only signatures.
 *
 * Used to reduce class source size for embedding when the full class
 * exceeds the embedding model's context limit. Methods have their own
 * nodes with separate embeddings.
 *
 * @example
 * ```typescript
 * const input = `class UserService {
 *   private db: Database;
 *
 *   async findUser(id: string): Promise<User> {
 *     const result = await this.db.query('SELECT * FROM users WHERE id = ?', [id]);
 *     return result.rows[0];
 *   }
 * }`;
 *
 * const output = stripClassImplementation(input);
 * // Returns:
 * // `class UserService {
 * //   private db: Database;
 * //
 * //   async findUser(id: string): Promise<User> { ... }
 * // }`
 * ```
 */
export const stripClassImplementation = (source: string): string => {
  const result: string[] = [];
  let i = 0;

  while (i < source.length) {
    // Look for opening brace that starts a method/function body
    if (source[i] === "{") {
      const beforeBrace = source.slice(0, i);

      if (isMethodSignature(beforeBrace)) {
        // Find matching closing brace
        let depth = 1;
        let j = i + 1;
        while (j < source.length && depth > 0) {
          if (source[j] === "{") {
            depth++;
          } else if (source[j] === "}") {
            depth--;
          }
          j++;
        }
        // Replace body with ellipsis
        result.push("{ ... }");
        i = j;
        continue;
      }
    }

    result.push(source.charAt(i));
    i++;
  }

  return result.join("");
};
