import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../config/Config.schemas.js";
import { extractConfiguredPackageNames } from "./extractConfiguredPackageNames.js";

describe(extractConfiguredPackageNames.name, () => {
  const tempDir = join(process.cwd(), "temp-test-extract-config");

  beforeEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  const createPackage = (relativePath: string, packageName: string) => {
    const packageDir = join(tempDir, relativePath);
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, "package.json"),
      JSON.stringify({ name: packageName, version: "1.0.0" }),
    );
    writeFileSync(
      join(packageDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: {} }),
    );
  };

  it("extracts npm package names from configured packages", () => {
    createPackage("libs/toolkit", "@libs/toolkit");
    createPackage("libs/ui", "@libs/ui");

    const config: ProjectConfig = {
      packages: [
        { name: "toolkit", tsconfig: "./libs/toolkit/tsconfig.json" },
        { name: "ui", tsconfig: "./libs/ui/tsconfig.json" },
      ],
    };

    const result = extractConfiguredPackageNames(config, tempDir);

    expect(result).toEqual(new Set(["@libs/toolkit", "@libs/ui"]));
  });

  it("returns empty set when no packages configured", () => {
    const config: ProjectConfig = {
      packages: [],
    };

    const result = extractConfiguredPackageNames(config, tempDir);

    expect(result).toEqual(new Set());
  });

  it("skips packages with missing package.json", () => {
    createPackage("libs/toolkit", "@libs/toolkit");
    // Don't create libs/ui - missing package.json

    const config: ProjectConfig = {
      packages: [
        { name: "toolkit", tsconfig: "./libs/toolkit/tsconfig.json" },
        { name: "ui", tsconfig: "./libs/ui/tsconfig.json" },
      ],
    };

    const result = extractConfiguredPackageNames(config, tempDir);

    expect(result).toEqual(new Set(["@libs/toolkit"]));
  });

  it("skips packages with invalid package.json", () => {
    createPackage("libs/toolkit", "@libs/toolkit");
    // Create invalid package.json
    const invalidDir = join(tempDir, "libs/invalid");
    mkdirSync(invalidDir, { recursive: true });
    writeFileSync(join(invalidDir, "package.json"), "not valid json");
    writeFileSync(join(invalidDir, "tsconfig.json"), "{}");

    const config: ProjectConfig = {
      packages: [
        { name: "toolkit", tsconfig: "./libs/toolkit/tsconfig.json" },
        { name: "invalid", tsconfig: "./libs/invalid/tsconfig.json" },
      ],
    };

    const result = extractConfiguredPackageNames(config, tempDir);

    expect(result).toEqual(new Set(["@libs/toolkit"]));
  });

  it("skips packages without name field", () => {
    createPackage("libs/toolkit", "@libs/toolkit");
    // Create package.json without name
    const noNameDir = join(tempDir, "libs/noname");
    mkdirSync(noNameDir, { recursive: true });
    writeFileSync(
      join(noNameDir, "package.json"),
      JSON.stringify({ version: "1.0.0" }),
    );
    writeFileSync(join(noNameDir, "tsconfig.json"), "{}");

    const config: ProjectConfig = {
      packages: [
        { name: "toolkit", tsconfig: "./libs/toolkit/tsconfig.json" },
        { name: "noname", tsconfig: "./libs/noname/tsconfig.json" },
      ],
    };

    const result = extractConfiguredPackageNames(config, tempDir);

    expect(result).toEqual(new Set(["@libs/toolkit"]));
  });
});
