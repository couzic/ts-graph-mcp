import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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
              return {
                resolvedFileName: resolved,
                isExternalLibraryImport: resolved.includes(".yarn"),
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
