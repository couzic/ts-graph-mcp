import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { Project, ts } from "ts-morph";

/**
 * Options for creating a ts-morph Project.
 */
export interface CreateProjectOptions {
  tsConfigFilePath: string;
}

/**
 * Yarn PnP API interface (subset we use).
 * @see https://yarnpkg.com/advanced/pnpapi
 */
interface PnpApi {
  resolveRequest: (
    request: string,
    issuer: string | null,
    opts?: { considerBuiltins?: boolean; extensions?: string[] },
  ) => string | null;
}

/**
 * Try to map a dist/ path to its corresponding src/ path.
 * Returns the source path if found, otherwise returns the original path.
 *
 * @example
 * mapDistToSrc('/pkg/dist/index.js') → '/pkg/src/index.ts' (if exists)
 * mapDistToSrc('/pkg/dist/foo/bar.js') → '/pkg/src/foo/bar.ts' (if exists)
 */
const mapDistToSrc = (distPath: string): string => {
  // Only handle paths containing /dist/
  const distIndex = distPath.indexOf("/dist/");
  if (distIndex === -1) {
    return distPath;
  }

  const packageRoot = distPath.substring(0, distIndex);
  const relativePath = distPath.substring(distIndex + "/dist/".length);

  // Remove .js/.mjs/.cjs extension and try .ts/.tsx
  const withoutExt = relativePath.replace(/\.(js|mjs|cjs)$/, "");
  const tsExtensions = [".ts", ".tsx"];

  for (const ext of tsExtensions) {
    const srcPath = join(packageRoot, "src", withoutExt + ext);
    if (existsSync(srcPath)) {
      return srcPath;
    }
  }

  // Try index.ts if the path was just "index.js"
  if (basename(withoutExt) === "index") {
    const parentDir = dirname(withoutExt);
    for (const ext of tsExtensions) {
      const srcPath = join(packageRoot, "src", parentDir, `index${ext}`);
      if (existsSync(srcPath)) {
        return srcPath;
      }
    }
  }

  return distPath;
};

/**
 * Find the Yarn PnP API for a given project path.
 * Returns null if not in a PnP environment.
 */
const findPnpApi = (projectPath: string): PnpApi | null => {
  // Look for .pnp.cjs in the project directory and its ancestors
  let currentDir = projectPath;
  while (currentDir !== dirname(currentDir)) {
    const pnpPath = join(currentDir, ".pnp.cjs");
    if (existsSync(pnpPath)) {
      try {
        // Load the PnP API from the project's .pnp.cjs
        const require = createRequire(pnpPath);
        const pnpApi = require(pnpPath) as PnpApi;
        if (typeof pnpApi.resolveRequest === "function") {
          return pnpApi;
        }
      } catch {
        // Failed to load PnP API, fall through
      }
    }
    currentDir = dirname(currentDir);
  }
  return null;
};

/**
 * Create a ts-morph Project with optional Yarn PnP resolution support.
 *
 * If the project is in a Yarn PnP environment (has .pnp.cjs), module resolution
 * will use Yarn's PnP API. Otherwise, standard TypeScript resolution is used.
 *
 * @param options - Project creation options
 * @returns ts-morph Project instance
 */
export const createProject = (options: CreateProjectOptions): Project => {
  const { tsConfigFilePath } = options;
  const projectDir = dirname(tsConfigFilePath);
  const pnpApi = findPnpApi(projectDir);

  if (!pnpApi) {
    // Standard resolution (no PnP)
    return new Project({ tsConfigFilePath });
  }

  // PnP resolution: use custom resolutionHost
  return new Project({
    tsConfigFilePath,
    resolutionHost: (moduleResolutionHost, getCompilerOptions) => ({
      resolveModuleNames: (
        moduleNames: string[],
        containingFile: string,
      ): (ts.ResolvedModule | undefined)[] => {
        const compilerOptions = getCompilerOptions();

        return moduleNames.map((moduleName) => {
          // Try PnP resolution first
          try {
            const resolved = pnpApi.resolveRequest(moduleName, containingFile, {
              extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
            });
            if (resolved) {
              // Skip files inside .yarn (zip archives, virtual packages)
              if (resolved.includes(".yarn/")) {
                return undefined;
              }
              // Skip non-code files (scss, css, images, etc.)
              const codeExtensions = [
                ".ts",
                ".tsx",
                ".d.ts",
                ".js",
                ".jsx",
                ".mjs",
                ".cjs",
              ];
              const isCodeFile = codeExtensions.some((ext) =>
                resolved.endsWith(ext),
              );
              if (!isCodeFile) {
                return undefined;
              }
              // Map dist/ paths to src/ paths for workspace packages
              const mappedPath = mapDistToSrc(resolved);
              return {
                resolvedFileName: mappedPath,
                isExternalLibraryImport: false,
              };
            }
          } catch {
            // PnP resolution failed, fall through to standard resolution
          }

          // Fall back to TypeScript's standard resolution
          const result = ts.resolveModuleName(
            moduleName,
            containingFile,
            compilerOptions,
            moduleResolutionHost,
          );
          return result.resolvedModule;
        });
      },
    }),
  });
};
