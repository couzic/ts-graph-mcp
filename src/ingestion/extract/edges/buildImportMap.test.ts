import { Project, ScriptTarget } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { ProjectRegistry } from "../../ProjectRegistry.js";
import { buildImportMap } from "./buildImportMap.js";

const createProject = () =>
  new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ES2020,
      strict: true,
    },
  });

describe(buildImportMap.name, () => {
  describe("basic import resolution", () => {
    it("resolves named import to target node ID", () => {
      const project = createProject();
      project.createSourceFile(
        "utils.ts",
        `export const formatDate = (d: Date) => d.toISOString();`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import { formatDate } from './utils.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("formatDate")).toBe("utils.ts:formatDate");
    });

    it("resolves aliased import using local name as key", () => {
      const project = createProject();
      project.createSourceFile(
        "utils.ts",
        `export const formatDate = (d: Date) => d.toISOString();`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import { formatDate as fd } from './utils.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("fd")).toBe("utils.ts:formatDate");
      expect(map.has("formatDate")).toBe(false);
    });

    it("resolves default import to actual symbol name", () => {
      const project = createProject();
      project.createSourceFile(
        "utils.ts",
        `const utils = { format: () => {} }; export default utils;`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import utils from './utils.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("utils")).toBe("utils.ts:utils");
    });

    it("resolves multiple named imports from same file", () => {
      const project = createProject();
      project.createSourceFile(
        "utils.ts",
        `
export const formatDate = (d: Date) => d.toISOString();
export const parseDate = (s: string) => new Date(s);
        `,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import { formatDate, parseDate } from './utils.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("formatDate")).toBe("utils.ts:formatDate");
      expect(map.get("parseDate")).toBe("utils.ts:parseDate");
    });
  });

  describe("type-only import handling", () => {
    it("skips type-only import declaration by default", () => {
      const project = createProject();
      project.createSourceFile(
        "types.ts",
        `export interface User { id: number; }`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import type { User } from './types.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.has("User")).toBe(false);
    });

    it("includes type-only imports when includeTypeImports is true", () => {
      const project = createProject();
      project.createSourceFile(
        "types.ts",
        `export interface User { id: number; }`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import type { User } from './types.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts", {
        includeTypeImports: true,
      });

      expect(map.get("User")).toBe("types.ts:User");
    });

    it("skips inline type-only imports by default", () => {
      const project = createProject();
      project.createSourceFile(
        "utils.ts",
        `
export interface User { id: number; }
export const format = () => {};
        `,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import { type User, format } from './utils.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.has("User")).toBe(false);
      expect(map.get("format")).toBe("utils.ts:format");
    });
  });

  describe("re-export chain resolution", () => {
    it("follows named re-export to actual definition", () => {
      const project = createProject();
      project.createSourceFile(
        "helpers.ts",
        `export const clamp = (v: number) => v;`,
      );
      project.createSourceFile(
        "index.ts",
        `export { clamp } from './helpers.js';`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import { clamp } from './index.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("clamp")).toBe("helpers.ts:clamp");
    });

    it("follows star re-export to actual definition", () => {
      const project = createProject();
      project.createSourceFile(
        "helpers.ts",
        `export const clamp = (v: number) => v;`,
      );
      project.createSourceFile("index.ts", `export * from './helpers.js';`);
      const consumer = project.createSourceFile(
        "handler.ts",
        `import { clamp } from './index.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("clamp")).toBe("helpers.ts:clamp");
    });

    it("follows default-as-named re-export to actual definition", () => {
      const project = createProject();
      project.createSourceFile(
        "Component.ts",
        `const Component = () => {}; export default Component;`,
      );
      project.createSourceFile(
        "index.ts",
        `export { default as Component } from './Component.js';`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import { Component } from './index.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      // Resolves to actual variable name, not "default"
      expect(map.get("Component")).toBe("Component.ts:Component");
    });

    it("follows nested re-export chain through multiple barrels", () => {
      const project = createProject();
      project.createSourceFile(
        "deep/helper.ts",
        `export const helper = () => {};`,
      );
      project.createSourceFile(
        "deep/index.ts",
        `export { helper } from './helper.js';`,
      );
      project.createSourceFile(
        "index.ts",
        `export { helper } from './deep/index.js';`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import { helper } from './index.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("helper")).toBe("deep/helper.ts:helper");
    });
  });

  describe("cross-package resolution with ProjectRegistry", () => {
    it("resolves path alias in barrel using library Project context", () => {
      // Consumer project (frontend) - no path aliases
      const consumerProject = createProject();

      // Library project (ui) - has path aliases
      // baseUrl must be absolute for in-memory file system
      const libraryProject = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: ScriptTarget.ES2020,
          strict: true,
          baseUrl: "/libs/ui",
          paths: {
            "@/components/*": ["src/components/*"],
          },
        },
      });

      // Actual component definition
      libraryProject.createSourceFile(
        "/libs/ui/src/components/Button/Button.ts",
        `const Button = () => {}; export default Button;`,
      );

      // Barrel file using path alias
      libraryProject.createSourceFile(
        "/libs/ui/src/index.ts",
        `export { default as Button } from '@/components/Button/Button';`,
      );

      // Also add barrel to consumer project (it sees the file but can't resolve the alias)
      consumerProject.createSourceFile(
        "/libs/ui/src/components/Button/Button.ts",
        `const Button = () => {}; export default Button;`,
      );
      consumerProject.createSourceFile(
        "/libs/ui/src/index.ts",
        `export { default as Button } from '@/components/Button/Button';`,
      );

      // Consumer file
      const consumer = consumerProject.createSourceFile(
        "/apps/frontend/src/App.ts",
        `import { Button } from '../../../libs/ui/src/index.js';`,
      );

      // Mock ProjectRegistry that returns libraryProject for library files
      const projectRegistry: ProjectRegistry = {
        getProjectForFile(absolutePath: string) {
          if (absolutePath.includes("/libs/ui/")) {
            return libraryProject;
          }
          return undefined;
        },
      };

      const map = buildImportMap(consumer, "apps/frontend/src/App.ts", {
        projectRegistry,
      });

      // Should resolve to actual definition, not barrel
      expect(map.get("Button")).toBe(
        "libs/ui/src/components/Button/Button.ts:Button",
      );
    });

    it("falls back to barrel path when ProjectRegistry returns undefined", () => {
      const project = createProject();

      // Barrel with unresolvable path alias (no baseUrl/paths configured)
      project.createSourceFile(
        "libs/ui/src/index.ts",
        `export { default as Button } from '@/components/Button';`,
      );
      const consumer = project.createSourceFile(
        "apps/App.ts",
        `import { Button } from '../libs/ui/src/index.js';`,
      );

      // ProjectRegistry that returns nothing
      const projectRegistry: ProjectRegistry = {
        getProjectForFile() {
          return undefined;
        },
      };

      const map = buildImportMap(consumer, "apps/App.ts", { projectRegistry });

      // Falls back to barrel file path since alias can't be resolved
      expect(map.get("Button")).toBe("libs/ui/src/index.ts:Button");
    });
  });

  it("resolves star re-export with path alias via ProjectRegistry", () => {
    // Consumer project - no path aliases
    const consumerProject = createProject();

    // Library project with path aliases
    const libraryProject = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ScriptTarget.ES2020,
        strict: true,
        baseUrl: "/libs/utils",
        paths: {
          "@/helpers/*": ["src/helpers/*"],
        },
      },
    });

    // Actual helper
    libraryProject.createSourceFile(
      "/libs/utils/src/helpers/format.ts",
      `export const formatDate = () => {};`,
    );

    // Barrel using star re-export with path alias
    libraryProject.createSourceFile(
      "/libs/utils/src/index.ts",
      `export * from '@/helpers/format';`,
    );

    // Consumer project sees barrel but can't resolve alias
    consumerProject.createSourceFile(
      "/libs/utils/src/helpers/format.ts",
      `export const formatDate = () => {};`,
    );
    consumerProject.createSourceFile(
      "/libs/utils/src/index.ts",
      `export * from '@/helpers/format';`,
    );

    const consumer = consumerProject.createSourceFile(
      "/apps/App.ts",
      `import { formatDate } from '../libs/utils/src/index.js';`,
    );

    const projectRegistry: ProjectRegistry = {
      getProjectForFile(absolutePath: string) {
        if (absolutePath.includes("/libs/utils/")) {
          return libraryProject;
        }
        return undefined;
      },
    };

    const map = buildImportMap(consumer, "apps/App.ts", { projectRegistry });

    // Should resolve through star re-export to actual definition
    expect(map.get("formatDate")).toBe(
      "libs/utils/src/helpers/format.ts:formatDate",
    );
  });

  it("resolves re-export with rename to original name", () => {
    const project = createProject();
    project.createSourceFile(
      "utils.ts",
      `export const internalFormat = () => {};`,
    );
    // Barrel re-exports with different name
    project.createSourceFile(
      "index.ts",
      `export { internalFormat as formatDate } from './utils.js';`,
    );
    const consumer = project.createSourceFile(
      "handler.ts",
      `import { formatDate } from './index.js';`,
    );

    const map = buildImportMap(consumer, "handler.ts");

    // Should use original name from source file, not the alias
    expect(map.get("formatDate")).toBe("utils.ts:internalFormat");
  });

  it("follows default import through re-export chain", () => {
    const project = createProject();
    project.createSourceFile(
      "Component.ts",
      `const Component = () => {}; export default Component;`,
    );
    // Barrel re-exports default
    project.createSourceFile(
      "index.ts",
      `export { default } from './Component.js';`,
    );
    const consumer = project.createSourceFile(
      "handler.ts",
      `import Comp from './index.js';`,
    );

    const map = buildImportMap(consumer, "handler.ts");

    // Should resolve to actual definition, not barrel
    expect(map.get("Comp")).toBe("Component.ts:Component");
  });

  it("resolves import from directory index file", () => {
    const project = createProject();
    project.createSourceFile(
      "utils/index.ts",
      `export const helper = () => {};`,
    );
    const consumer = project.createSourceFile(
      "handler.ts",
      `import { helper } from './utils/index.js';`,
    );

    const map = buildImportMap(consumer, "handler.ts");

    expect(map.get("helper")).toBe("utils/index.ts:helper");
  });

  it("handles namespace re-export", () => {
    const project = createProject();
    project.createSourceFile("helpers.ts", `export const clamp = () => {};`);
    // Namespace re-export: export * as Utils from './helpers'
    project.createSourceFile(
      "index.ts",
      `export * as Helpers from './helpers.js';`,
    );
    const consumer = project.createSourceFile(
      "handler.ts",
      `import { Helpers } from './index.js';`,
    );

    const map = buildImportMap(consumer, "handler.ts");

    // Namespace imports should map to the barrel, not individual exports
    // Since Helpers.clamp() needs runtime resolution
    expect(map.has("Helpers")).toBe(true);
  });

  describe("edge cases", () => {
    it("ignores external module imports", () => {
      const project = createProject();
      const consumer = project.createSourceFile(
        "handler.ts",
        `import { useState } from 'react';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.has("useState")).toBe(false);
    });

    it("handles imports from multiple files", () => {
      const project = createProject();
      project.createSourceFile("utils.ts", `export const format = () => {};`);
      project.createSourceFile("helpers.ts", `export const clamp = () => {};`);
      const consumer = project.createSourceFile(
        "handler.ts",
        `
import { format } from './utils.js';
import { clamp } from './helpers.js';
        `,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("format")).toBe("utils.ts:format");
      expect(map.get("clamp")).toBe("helpers.ts:clamp");
    });

    it("handles .js extension in import path (ESM pattern)", () => {
      const project = createProject();
      project.createSourceFile("utils.ts", `export const format = () => {};`);
      const consumer = project.createSourceFile(
        "handler.ts",
        `import { format } from './utils.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("format")).toBe("utils.ts:format");
    });

    it("handles anonymous default export (arrow function)", () => {
      const project = createProject();
      project.createSourceFile("utils.ts", `export default () => {};`);
      const consumer = project.createSourceFile(
        "handler.ts",
        `import myFunc from './utils.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      // Anonymous exports have no symbol name, should fall back to "default"
      expect(map.get("myFunc")).toBe("utils.ts:default");
    });

    it("handles anonymous default export (object literal)", () => {
      const project = createProject();
      project.createSourceFile("config.ts", `export default { key: "value" };`);
      const consumer = project.createSourceFile(
        "handler.ts",
        `import config from './config.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("config")).toBe("config.ts:default");
    });

    it("handles mixed default and named imports from same file", () => {
      const project = createProject();
      project.createSourceFile(
        "utils.ts",
        `
const utils = { format: () => {} };
export default utils;
export const helper = () => {};
        `,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import utils, { helper } from './utils.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("utils")).toBe("utils.ts:utils");
      expect(map.get("helper")).toBe("utils.ts:helper");
    });

    it("handles named re-exported as default", () => {
      const project = createProject();
      project.createSourceFile("Button.ts", `export const Button = () => {};`);
      // Barrel re-exports named as default
      project.createSourceFile(
        "index.ts",
        `export { Button as default } from './Button.js';`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import Btn from './index.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      // Should resolve to actual definition
      expect(map.get("Btn")).toBe("Button.ts:Button");
    });

    it("handles direct default export of named class", () => {
      const project = createProject();
      project.createSourceFile(
        "User.ts",
        `export default class User { name: string; }`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import User from './User.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("User")).toBe("User.ts:User");
    });

    it("handles direct default export of named function", () => {
      const project = createProject();
      project.createSourceFile(
        "format.ts",
        `export default function formatDate(d: Date) { return d.toISOString(); }`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import fmt from './format.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      expect(map.get("fmt")).toBe("format.ts:formatDate");
    });

    it("handles anonymous default class export", () => {
      const project = createProject();
      project.createSourceFile(
        "User.ts",
        `export default class { name: string; }`,
      );
      const consumer = project.createSourceFile(
        "handler.ts",
        `import User from './User.js';`,
      );

      const map = buildImportMap(consumer, "handler.ts");

      // Anonymous class, falls back to "default"
      expect(map.get("User")).toBe("User.ts:default");
    });
  });
});
