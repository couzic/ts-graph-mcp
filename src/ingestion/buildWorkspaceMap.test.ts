import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorkspaceMap } from "./buildWorkspaceMap.js";

const tempDir = join(import.meta.dirname, "__test-workspace-map__");

const createTempDir = (relativePath: string) => {
  const dir = join(tempDir, relativePath);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const writePackageJson = (
  relativePath: string,
  content: Record<string, unknown>,
) => {
  const filePath = join(tempDir, relativePath, "package.json");
  writeFileSync(filePath, JSON.stringify(content, null, 2));
};

const writeFile = (relativePath: string, content = "") => {
  const filePath = join(tempDir, relativePath);
  const dir = join(filePath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, content);
};

const writeTsconfig = (
  relativePath: string,
  options: { outDir?: string; rootDir?: string } = {},
) => {
  const filePath = join(tempDir, relativePath, "tsconfig.json");
  const compilerOptions: Record<string, string> = {};
  if (options.outDir !== undefined) {
    // biome-ignore lint/complexity/useLiteralKeys: TS requires bracket notation for index signatures
    compilerOptions["outDir"] = options.outDir;
  }
  if (options.rootDir !== undefined) {
    // biome-ignore lint/complexity/useLiteralKeys: TS requires bracket notation for index signatures
    compilerOptions["rootDir"] = options.rootDir;
  }
  const content = { compilerOptions };
  writeFileSync(filePath, JSON.stringify(content, null, 2));
};

/**
 * Create a complete workspace package with package.json, tsconfig.json, and source entry.
 */
const createWorkspacePackage = (
  relativePath: string,
  packageName: string,
  options: { main?: string; outDir?: string; rootDir?: string } = {},
) => {
  const main = options.main ?? "./dist/index.js";
  const outDir = options.outDir ?? "./dist";
  const rootDir = options.rootDir ?? "./src";

  createTempDir(`${relativePath}/src`);
  writePackageJson(relativePath, {
    name: packageName,
    version: "1.0.0",
    main,
  });
  writeTsconfig(relativePath, { outDir, rootDir });
  writeFile(`${relativePath}/src/index.ts`);
};

describe(buildWorkspaceMap.name, () => {
  beforeAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe("empty workspaces", () => {
    it("returns empty map when no workspaces field in package.json", () => {
      const testDir = createTempDir("empty-workspaces");
      writePackageJson("empty-workspaces", {
        name: "root",
        version: "1.0.0",
      });

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(0);
    });

    it("returns empty map when workspaces array is empty", () => {
      const testDir = createTempDir("empty-array");
      writePackageJson("empty-array", {
        name: "root",
        version: "1.0.0",
        workspaces: [],
      });

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(0);
    });
  });

  describe("simple workspaces array", () => {
    it("maps packages from direct paths", () => {
      const testDir = createTempDir("simple-workspaces");
      writePackageJson("simple-workspaces", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a", "packages/b"],
      });

      createWorkspacePackage("simple-workspaces/packages/a", "package-a");
      createWorkspacePackage("simple-workspaces/packages/b", "package-b");

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(2);
      expect(result.get("package-a")).toBe(
        join(testDir, "packages/a/src/index.ts"),
      );
      expect(result.get("package-b")).toBe(
        join(testDir, "packages/b/src/index.ts"),
      );
    });
  });

  describe("glob patterns", () => {
    it("expands glob pattern to multiple packages", () => {
      const testDir = createTempDir("glob-workspaces");
      writePackageJson("glob-workspaces", {
        name: "root",
        version: "1.0.0",
        workspaces: ["libs/*"],
      });

      createWorkspacePackage("glob-workspaces/libs/utils", "utils");
      createWorkspacePackage("glob-workspaces/libs/core", "core");

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(2);
      expect(result.get("utils")).toBe(
        join(testDir, "libs/utils/src/index.ts"),
      );
      expect(result.get("core")).toBe(join(testDir, "libs/core/src/index.ts"));
    });
  });

  describe("scoped packages", () => {
    it("maps scoped package names correctly", () => {
      const testDir = createTempDir("scoped-packages");
      writePackageJson("scoped-packages", {
        name: "root",
        version: "1.0.0",
        workspaces: ["libs/*"],
      });

      createWorkspacePackage("scoped-packages/libs/toolkit", "@libs/toolkit");
      createWorkspacePackage("scoped-packages/libs/ui", "@myorg/ui-components");

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(2);
      expect(result.get("@libs/toolkit")).toBe(
        join(testDir, "libs/toolkit/src/index.ts"),
      );
      expect(result.get("@myorg/ui-components")).toBe(
        join(testDir, "libs/ui/src/index.ts"),
      );
    });
  });

  describe("nested workspaces", () => {
    it("recursively processes packages with their own workspaces", () => {
      const testDir = createTempDir("nested-workspaces");
      writePackageJson("nested-workspaces", {
        name: "root",
        version: "1.0.0",
        workspaces: ["modules/*"],
      });

      createTempDir("nested-workspaces/modules/app");
      writePackageJson("nested-workspaces/modules/app", {
        name: "app",
        version: "1.0.0",
        workspaces: ["packages/*"],
      });

      createWorkspacePackage(
        "nested-workspaces/modules/app/packages/frontend",
        "@app/frontend",
      );
      createWorkspacePackage(
        "nested-workspaces/modules/app/packages/backend",
        "@app/backend",
      );

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(2);
      expect(result.get("@app/frontend")).toBe(
        join(testDir, "modules/app/packages/frontend/src/index.ts"),
      );
      expect(result.get("@app/backend")).toBe(
        join(testDir, "modules/app/packages/backend/src/index.ts"),
      );
    });
  });

  describe("source entry inference", () => {
    it("infers source entry from main and outDir/rootDir mapping", () => {
      const testDir = createTempDir("inference-basic");
      writePackageJson("inference-basic", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a"],
      });

      createTempDir("inference-basic/packages/a/src");
      writePackageJson("inference-basic/packages/a", {
        name: "package-a",
        version: "1.0.0",
        main: "./dist/index.js",
      });
      writeTsconfig("inference-basic/packages/a", {
        outDir: "./dist",
        rootDir: "./src",
      });
      writeFile("inference-basic/packages/a/src/index.ts");

      const result = buildWorkspaceMap(testDir);

      expect(result.get("package-a")).toBe(
        join(testDir, "packages/a/src/index.ts"),
      );
    });

    it("handles main pointing to root directory with no outDir/rootDir", () => {
      const testDir = createTempDir("inference-root");
      writePackageJson("inference-root", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a"],
      });

      createTempDir("inference-root/packages/a");
      writePackageJson("inference-root/packages/a", {
        name: "package-a",
        version: "1.0.0",
        main: "./index.js",
      });
      writeTsconfig("inference-root/packages/a", {});
      writeFile("inference-root/packages/a/index.ts");

      const result = buildWorkspaceMap(testDir);

      expect(result.get("package-a")).toBe(
        join(testDir, "packages/a/index.ts"),
      );
    });

    it("handles .mjs extension in main", () => {
      const testDir = createTempDir("inference-mjs");
      writePackageJson("inference-mjs", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a"],
      });

      createTempDir("inference-mjs/packages/a/src");
      writePackageJson("inference-mjs/packages/a", {
        name: "package-a",
        version: "1.0.0",
        main: "./dist/index.mjs",
      });
      writeTsconfig("inference-mjs/packages/a", {
        outDir: "./dist",
        rootDir: "./src",
      });
      writeFile("inference-mjs/packages/a/src/index.ts");

      const result = buildWorkspaceMap(testDir);

      expect(result.get("package-a")).toBe(
        join(testDir, "packages/a/src/index.ts"),
      );
    });

    it("falls back to .tsx when .ts does not exist", () => {
      const testDir = createTempDir("inference-tsx");
      writePackageJson("inference-tsx", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a"],
      });

      createTempDir("inference-tsx/packages/a/src");
      writePackageJson("inference-tsx/packages/a", {
        name: "package-a",
        version: "1.0.0",
        main: "./dist/index.js",
      });
      writeTsconfig("inference-tsx/packages/a", {
        outDir: "./dist",
        rootDir: "./src",
      });
      writeFile("inference-tsx/packages/a/src/index.tsx");

      const result = buildWorkspaceMap(testDir);

      expect(result.get("package-a")).toBe(
        join(testDir, "packages/a/src/index.tsx"),
      );
    });

    it("handles custom outDir/rootDir paths", () => {
      const testDir = createTempDir("inference-custom");
      writePackageJson("inference-custom", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a"],
      });

      createTempDir("inference-custom/packages/a/lib");
      writePackageJson("inference-custom/packages/a", {
        name: "package-a",
        version: "1.0.0",
        main: "./build/index.js",
      });
      writeTsconfig("inference-custom/packages/a", {
        outDir: "./build",
        rootDir: "./lib",
      });
      writeFile("inference-custom/packages/a/lib/index.ts");

      const result = buildWorkspaceMap(testDir);

      expect(result.get("package-a")).toBe(
        join(testDir, "packages/a/lib/index.ts"),
      );
    });

    it("falls back to src/ when rootDir is not specified", () => {
      const testDir = createTempDir("inference-src-fallback");
      writePackageJson("inference-src-fallback", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a"],
      });

      createTempDir("inference-src-fallback/packages/a/src");
      writePackageJson("inference-src-fallback/packages/a", {
        name: "package-a",
        version: "1.0.0",
        main: "./dist/index.js",
      });
      // Only outDir specified, no rootDir - should fall back to src/
      writeTsconfig("inference-src-fallback/packages/a", {
        outDir: "./dist",
      });
      writeFile("inference-src-fallback/packages/a/src/index.ts");

      const result = buildWorkspaceMap(testDir);

      expect(result.get("package-a")).toBe(
        join(testDir, "packages/a/src/index.ts"),
      );
    });
  });

  describe("missing package.json", () => {
    it("skips directories without package.json", () => {
      const testDir = createTempDir("missing-pkg");
      writePackageJson("missing-pkg", {
        name: "root",
        version: "1.0.0",
        workspaces: ["libs/*"],
      });

      createWorkspacePackage("missing-pkg/libs/valid", "valid-pkg");

      // Directory without package.json
      createTempDir("missing-pkg/libs/invalid/src");
      writeFile("missing-pkg/libs/invalid/src/index.ts");

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(1);
      expect(result.get("valid-pkg")).toBe(
        join(testDir, "libs/valid/src/index.ts"),
      );
    });
  });

  describe("skips invalid packages silently", () => {
    it("skips packages without main field", () => {
      const testDir = createTempDir("no-main");
      writePackageJson("no-main", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a"],
      });

      createTempDir("no-main/packages/a/src");
      writePackageJson("no-main/packages/a", {
        name: "package-a",
        version: "1.0.0",
        // No main field
      });
      writeTsconfig("no-main/packages/a", {
        outDir: "./dist",
        rootDir: "./src",
      });
      writeFile("no-main/packages/a/src/index.ts");

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(0);
    });

    it("skips packages without tsconfig.json", () => {
      const testDir = createTempDir("no-tsconfig");
      writePackageJson("no-tsconfig", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a"],
      });

      createTempDir("no-tsconfig/packages/a/src");
      writePackageJson("no-tsconfig/packages/a", {
        name: "package-a",
        version: "1.0.0",
        main: "./dist/index.js",
      });
      // No tsconfig.json
      writeFile("no-tsconfig/packages/a/src/index.ts");

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(0);
    });

    it("skips packages where main does not match outDir prefix", () => {
      const testDir = createTempDir("main-mismatch");
      writePackageJson("main-mismatch", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a"],
      });

      createTempDir("main-mismatch/packages/a/src");
      writePackageJson("main-mismatch/packages/a", {
        name: "package-a",
        version: "1.0.0",
        main: "./lib/index.js", // main points to lib, but outDir is dist
      });
      writeTsconfig("main-mismatch/packages/a", {
        outDir: "./dist",
        rootDir: "./src",
      });
      writeFile("main-mismatch/packages/a/src/index.ts");

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(0);
    });

    it("skips packages where inferred source file does not exist", () => {
      const testDir = createTempDir("source-missing");
      writePackageJson("source-missing", {
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/a"],
      });

      createTempDir("source-missing/packages/a/src");
      writePackageJson("source-missing/packages/a", {
        name: "package-a",
        version: "1.0.0",
        main: "./dist/index.js",
      });
      writeTsconfig("source-missing/packages/a", {
        outDir: "./dist",
        rootDir: "./src",
      });
      // No index.ts file created

      const result = buildWorkspaceMap(testDir);

      expect(result.size).toBe(0);
    });
  });

  describe("real yarn-pnp-monorepo", () => {
    const monorepoRoot = join(
      import.meta.dirname,
      "../../sample-projects/yarn-pnp-monorepo",
    );

    it("finds @libs/toolkit with correct entry point", () => {
      const result = buildWorkspaceMap(monorepoRoot);

      expect(result.get("@libs/toolkit")).toBe(
        join(monorepoRoot, "libs/toolkit/src/index.ts"),
      );
    });

    it("finds @libs/ui with correct entry point", () => {
      const result = buildWorkspaceMap(monorepoRoot);

      expect(result.get("@libs/ui")).toBe(
        join(monorepoRoot, "libs/ui/src/index.ts"),
      );
    });

    it("finds @app/shared with correct entry point", () => {
      const result = buildWorkspaceMap(monorepoRoot);

      expect(result.get("@app/shared")).toBe(
        join(monorepoRoot, "modules/app/packages/shared/src/index.ts"),
      );
    });

    it("finds packages from libs/* glob pattern", () => {
      const result = buildWorkspaceMap(monorepoRoot);

      expect(result.has("@libs/toolkit")).toBe(true);
      expect(result.has("@libs/ui")).toBe(true);
      expect(result.has("@libs/text-utils")).toBe(true);
      expect(result.has("@libs/error-utils")).toBe(true);
    });

    it("finds packages from modules/app/packages/* nested workspace", () => {
      const result = buildWorkspaceMap(monorepoRoot);

      expect(result.has("@app/shared")).toBe(true);
      expect(result.has("@app/frontend")).toBe(true);
      expect(result.has("@app/backend")).toBe(true);
    });

    it("finds package from modules/analytics-api direct path", () => {
      const result = buildWorkspaceMap(monorepoRoot);

      expect(result.has("@modules/analytics-api")).toBe(true);
      expect(result.get("@modules/analytics-api")).toBe(
        join(monorepoRoot, "modules/analytics-api/src/index.ts"),
      );
    });
  });
});
