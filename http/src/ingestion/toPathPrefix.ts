import { normalizePath } from "./normalizePath.js";

/**
 * Normalize a package root path into a path prefix for matching.
 * Ensures forward slashes and trailing slash for consistent startsWith comparisons.
 *
 * @example
 * toPathPrefix("C:\\project\\libs\\ui") // "C:/project/libs/ui/"
 */
export const toPathPrefix = (packageRoot: string): string => {
  const normalized = normalizePath(packageRoot);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
};
