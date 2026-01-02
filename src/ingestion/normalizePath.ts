const BACKSLASH_REGEX = /\\/g;

/**
 * Normalize path separators to forward slashes.
 * Ensures consistent path comparison across Windows and Unix.
 *
 * @example
 * normalizePath("C:\\project\\src\\file.ts") // "C:/project/src/file.ts"
 */
export const normalizePath = (path: string): string =>
  path.replace(BACKSLASH_REGEX, "/");
