/**
 * Derive the project root from an absolute path and its known relative path.
 *
 * @example
 * deriveProjectRoot("/home/user/project/src/file.ts", "src/file.ts")
 * // Returns: "/home/user/project/"
 */
export const deriveProjectRoot = (
  absolutePath: string,
  relativePath: string,
): string => {
  if (absolutePath.endsWith(relativePath)) {
    return absolutePath.slice(0, absolutePath.length - relativePath.length);
  }
  return "";
};
