import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { generateNodeId } from "../../generateNodeId.js";
import type { EdgeExtractionContext } from "./EdgeExtractionContext.js";
import { extractCallEdges } from "./extractCallEdges.js";

describe(extractCallEdges.name, () => {
  const createProject = () => new Project({ useInMemoryFileSystem: true });

  const defaultContext: EdgeExtractionContext = {
    filePath: "test.ts",
    package: "test-package",
  };

  it("extracts CALLS edges between functions", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export const add = (a: number, b: number): number => a + b;
export const calculate = (x: number, y: number): number => add(x, y);
        `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "calculate"),
      target: generateNodeId("test.ts", "add"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 3, end: 3 }],
    });
  });

  it("collects call site line numbers for multiple calls", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export const log = (msg: string) => console.log(msg);
export const doWork = () => {
  log('start');
  log('processing');
  log('done');
};
        `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "doWork"),
      target: generateNodeId("test.ts", "log"),
      type: "CALLS",
      callCount: 3,
      callSites: [
        { start: 4, end: 4 },
        { start: 5, end: 5 },
        { start: 6, end: 6 },
      ],
    });
  });

  it("extracts CALLS edges from method to function", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export const validate = (value: string): boolean => value.length > 0;

export class User {
  name: string;

  isValid(): boolean {
    return validate(this.name);
  }
}
        `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "User", "isValid"),
      target: generateNodeId("test.ts", "validate"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 8, end: 8 }],
    });
  });

  it("extracts cross-file function calls", () => {
    const project = createProject();

    // File A: utility function to be called
    // Note: We create the file but don't need to reference it - handler.ts imports from it
    project.createSourceFile(
      "utils.ts",
      `
export const formatDate = (date: Date): string => {
  return date.toISOString();
};
        `,
    );

    // File B: handler that calls the utility
    const handlerFile = project.createSourceFile(
      "handler.ts",
      `
import { formatDate } from './utils';

export const processEvent = (timestamp: Date): string => {
  return formatDate(timestamp);
};
        `,
    );

    // Cross-file calls work via buildImportMap (ts-morph import resolution)
    const edges = extractCallEdges(handlerFile, {
      filePath: "handler.ts",
      package: "test-package",
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("handler.ts", "processEvent"),
      target: generateNodeId("utils.ts", "formatDate"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 5, end: 5 }],
    });
  });

  it("extracts indirect call through local variable alias", () => {
    const project = createProject();

    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export const target = (): string => "result";

export const caller = (): string => {
  const fn = target;
  return fn();
};
        `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "caller"),
      target: generateNodeId("test.ts", "target"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 6, end: 6 }],
    });
  });

  it("resolves calls through barrel file re-export", () => {
    const project = createProject();

    // Actual definition
    project.createSourceFile(
      "utils/helper.ts",
      `export const formatValue = (v: number) => v.toFixed(2);`,
    );

    // Barrel file re-exporting
    project.createSourceFile(
      "utils/index.ts",
      `export { formatValue } from './helper';`,
    );

    // Consumer imports from barrel
    const consumer = project.createSourceFile(
      "consumer.ts",
      `
import { formatValue } from './utils';
export const display = (n: number) => formatValue(n);
      `,
    );

    const edges = extractCallEdges(consumer, {
      filePath: "consumer.ts",
      package: "test",
    });

    expect(edges).toHaveLength(1);
    // Edge should point to actual definition, NOT barrel file
    expect(edges[0]?.target).toBe("utils/helper.ts:formatValue");
  });

  it("resolves calls through nested barrel files", () => {
    const project = createProject();

    // Actual definition in deep file
    project.createSourceFile(
      "lib/core/math.ts",
      `export const add = (a: number, b: number) => a + b;`,
    );

    // First barrel
    project.createSourceFile(
      "lib/core/index.ts",
      `export { add } from './math';`,
    );

    // Second barrel
    project.createSourceFile("lib/index.ts", `export { add } from './core';`);

    // Consumer
    const consumer = project.createSourceFile(
      "app.ts",
      `
import { add } from './lib';
export const sum = () => add(1, 2);
      `,
    );

    const edges = extractCallEdges(consumer, {
      filePath: "app.ts",
      package: "test",
    });

    expect(edges).toHaveLength(1);
    // Should resolve through both barrels to actual definition
    expect(edges[0]?.target).toBe("lib/core/math.ts:add");
  });

  it("extracts CALLS edges from function to method (same file)", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class UserService {
  save(): void {
    console.log("saved");
  }
}

export function handleRequest() {
  const service = new UserService();
  service.save();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "handleRequest"),
      target: generateNodeId("test.ts", "UserService", "save"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 10, end: 10 }],
    });
  });

  it("extracts CALLS edges from function to method (cross-file)", () => {
    const project = createProject();

    // File with class
    project.createSourceFile(
      "src/UserService.ts",
      `
export class UserService {
  save(): void {
    console.log("saved");
  }
}
      `,
    );

    // File with function calling the method
    const handlerFile = project.createSourceFile(
      "src/handler.ts",
      `
import { UserService } from './UserService';

export function handleRequest() {
  const service = new UserService();
  service.save();
}
      `,
    );

    const edges = extractCallEdges(handlerFile, {
      filePath: "src/handler.ts",
      package: "test-package",
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("src/handler.ts", "handleRequest"),
      target: generateNodeId("src/UserService.ts", "UserService", "save"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 6, end: 6 }],
    });
  });

  it("extracts CALLS edges from method to method (same class)", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class UserService {
  private validate(): boolean {
    return true;
  }

  save(): void {
    if (this.validate()) {
      console.log("saved");
    }
  }
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "UserService", "save"),
      target: generateNodeId("test.ts", "UserService", "validate"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 8, end: 8 }],
    });
  });

  it("extracts CALLS edges from method to method (cross-file)", () => {
    const project = createProject();

    // File with validator class
    project.createSourceFile(
      "src/Validator.ts",
      `
export class Validator {
  check(value: string): boolean {
    return value.length > 0;
  }
}
      `,
    );

    // File with service class that uses validator
    const serviceFile = project.createSourceFile(
      "src/UserService.ts",
      `
import { Validator } from './Validator';

export class UserService {
  private validator = new Validator();

  save(name: string): void {
    if (this.validator.check(name)) {
      console.log("saved");
    }
  }
}
      `,
    );

    const edges = extractCallEdges(serviceFile, {
      filePath: "src/UserService.ts",
      package: "test-package",
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("src/UserService.ts", "UserService", "save"),
      target: generateNodeId("src/Validator.ts", "Validator", "check"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 8, end: 8 }],
    });
  });

  it("extracts CALLS edges for static method calls", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class UserService {
  static create(): UserService {
    return new UserService();
  }
}

export function handleRequest() {
  const service = UserService.create();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("test.ts", "handleRequest"),
      target: generateNodeId("test.ts", "UserService", "create"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 9, end: 9 }],
    });
  });

  it("extracts CALLS edges for static method calls (cross-file)", () => {
    const project = createProject();

    project.createSourceFile(
      "src/UserService.ts",
      `
export class UserService {
  static create(): UserService {
    return new UserService();
  }
}
      `,
    );

    const handlerFile = project.createSourceFile(
      "src/handler.ts",
      `
import { UserService } from './UserService';

export function handleRequest() {
  const service = UserService.create();
}
      `,
    );

    const edges = extractCallEdges(handlerFile, {
      filePath: "src/handler.ts",
      package: "test-package",
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      source: generateNodeId("src/handler.ts", "handleRequest"),
      target: generateNodeId("src/UserService.ts", "UserService", "create"),
      type: "CALLS",
      callCount: 1,
      callSites: [{ start: 5, end: 5 }],
    });
  });

  it("extracts CALLS edges for chained method calls", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class Builder {
  setValue(): Builder {
    return this;
  }
  build(): string {
    return "result";
  }
}

export function getBuilder(): Builder {
  return new Builder();
}

export function handleRequest() {
  const result = getBuilder().setValue().build();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    // Should find: handleRequest -> getBuilder, handleRequest -> setValue, handleRequest -> build
    expect(edges).toHaveLength(3);
    const targets = edges.map((e) => e.target);
    expect(targets).toContain(generateNodeId("test.ts", "getBuilder"));
    expect(targets).toContain(generateNodeId("test.ts", "Builder", "setValue"));
    expect(targets).toContain(generateNodeId("test.ts", "Builder", "build"));
  });

  it("extracts CALLS edges when method is destructured from object", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class UserService {
  save(): void {
    console.log("saved");
  }
}

export function handleRequest() {
  const service = new UserService();
  const { save } = service;
  save();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    // Destructured method call - should this resolve to UserService.save?
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe(
      generateNodeId("test.ts", "UserService", "save"),
    );
  });

  it("extracts CALLS edges for inherited method calls", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class BaseService {
  save(): void {
    console.log("saved");
  }
}

export class UserService extends BaseService {}

export function handleRequest() {
  const service = new UserService();
  service.save();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    // Call to inherited method - should point to BaseService.save where it's defined
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe(
      generateNodeId("test.ts", "BaseService", "save"),
    );
  });

  it("extracts CALLS edges for overridden method calls", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class BaseService {
  save(): void {
    console.log("base save");
  }
}

export class UserService extends BaseService {
  save(): void {
    console.log("user save");
  }
}

export function handleRequest() {
  const service = new UserService();
  service.save();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    // Call to overridden method - should point to UserService.save (the override)
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe(
      generateNodeId("test.ts", "UserService", "save"),
    );
  });

  it("extracts CALLS edges for arrow function class properties", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class UserService {
  save = (): void => {
    console.log("saved");
  };
}

export function handleRequest() {
  const service = new UserService();
  service.save();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    // Arrow function property - should this be tracked as UserService.save?
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe(
      generateNodeId("test.ts", "UserService", "save"),
    );
  });

  it("extracts CALLS edges for inherited method calls (cross-file)", () => {
    const project = createProject();

    project.createSourceFile(
      "src/BaseService.ts",
      `
export class BaseService {
  save(): void {
    console.log("saved");
  }
}
      `,
    );

    project.createSourceFile(
      "src/UserService.ts",
      `
import { BaseService } from './BaseService';

export class UserService extends BaseService {}
      `,
    );

    const handlerFile = project.createSourceFile(
      "src/handler.ts",
      `
import { UserService } from './UserService';

export function handleRequest() {
  const service = new UserService();
  service.save();
}
      `,
    );

    const edges = extractCallEdges(handlerFile, {
      filePath: "src/handler.ts",
      package: "test-package",
    });

    // Call to inherited method from different file
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe(
      generateNodeId("src/BaseService.ts", "BaseService", "save"),
    );
  });

  it("extracts CALLS edges for super.method() calls", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class BaseService {
  save(): void {
    console.log("base save");
  }
}

export class UserService extends BaseService {
  save(): void {
    super.save();
    console.log("user save");
  }
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    // super.save() should point to BaseService.save
    expect(edges).toHaveLength(1);
    expect(edges[0]?.source).toBe(
      generateNodeId("test.ts", "UserService", "save"),
    );
    expect(edges[0]?.target).toBe(
      generateNodeId("test.ts", "BaseService", "save"),
    );
  });

  it("extracts CALLS edges for optional chaining method calls", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class UserService {
  save(): void {
    console.log("saved");
  }
}

export function handleRequest(service: UserService | null) {
  service?.save();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe(
      generateNodeId("test.ts", "UserService", "save"),
    );
  });

  it("extracts CALLS edges for getter access that returns callable", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export class Config {
  get validator(): () => boolean {
    return () => true;
  }
}

export function validate(config: Config) {
  return config.validator();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    // Calling the result of a getter - should this track the getter?
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe(
      generateNodeId("test.ts", "Config", "validator"),
    );
  });

  it("extracts CALLS edges from constructor", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export function initialize(): void {
  console.log("init");
}

export class UserService {
  constructor() {
    initialize();
  }
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "test.ts:UserService.constructor",
      target: "test.ts:initialize",
      type: "CALLS",
    });
  });

  it("extracts CALLS edges for method call via interface type", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export interface IService {
  save(): void;
}

export class UserService implements IService {
  save(): void {
    console.log("saved");
  }
}

export function handleRequest(service: IService) {
  service.save();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    // Call via interface type - where does it point?
    expect(edges).toHaveLength(1);
    // This is tricky - the type is IService but the implementation is UserService
    // At runtime it could be any implementation, so it should probably point to the interface
  });

  it("extracts CALLS edges FROM getter body", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export function validate(v: string): string {
  return v.trim();
}

export class Config {
  private _value: string = "";

  get value(): string {
    return validate(this._value);
  }
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "test.ts:Config.value:get",
      target: "test.ts:validate",
      type: "CALLS",
    });
  });

  it("extracts CALLS edges FROM setter body", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export function validate(v: string): string {
  return v.trim();
}

export class Config {
  private _value: string = "";

  set value(v: string) {
    this._value = validate(v);
  }
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "test.ts:Config.value:set",
      target: "test.ts:validate",
      type: "CALLS",
    });
  });

  it("extracts CALLS edges FROM arrow function property in class", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export function log(msg: string): void {
  console.log(msg);
}

export class Handler {
  handleClick = () => {
    log("clicked");
  }
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "test.ts:Handler.handleClick",
      target: "test.ts:log",
      type: "CALLS",
    });
  });

  it("extracts CALLS edges from property initializers", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export function getLogger(): object {
  return {};
}

export class Service {
  logger = getLogger();
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "test.ts:Service.logger",
      target: "test.ts:getLogger",
      type: "CALLS",
    });
  });

  it("extracts CALLS edges from static initializer blocks", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export function initialize(): void {
  console.log("init");
}

export class Config {
  static {
    initialize();
  }
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "test.ts:Config.static",
      target: "test.ts:initialize",
      type: "CALLS",
    });
  });

  it("extracts CALLS edges from class expressions", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export function helper(): void {
  console.log("help");
}

export const MyClass = class {
  method() {
    helper();
  }
};
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "test.ts:MyClass.method",
      target: "test.ts:helper",
      type: "CALLS",
    });
  });

  it("extracts CALLS edges from default parameter values", () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      "test.ts",
      `
export function getDefault(): string {
  return "default";
}

export function process(value: string = getDefault()): string {
  return value;
}
      `,
    );

    const edges = extractCallEdges(sourceFile, defaultContext);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "test.ts:process",
      target: "test.ts:getDefault",
      type: "CALLS",
    });
  });
});
