import { describe, expect, it } from "vitest";
import { formatDisambiguationMessage } from "./classMethodFallback.js";

describe(formatDisambiguationMessage.name, () => {
  it("formats single method with dependencies", () => {
    const result = formatDisambiguationMessage("MyClass", [
      { id: "src/foo.ts:MyClass.doSomething", name: "doSomething", hasDependencies: true },
    ]);

    expect(result).toBe(
      `Class 'MyClass' has no direct dependencies.
Available methods:
- MyClass.doSomething
Retry with fully qualified method name.`,
    );
  });

  it("formats single method without dependencies", () => {
    const result = formatDisambiguationMessage("MyClass", [
      { id: "src/foo.ts:MyClass.doSomething", name: "doSomething", hasDependencies: false },
    ]);

    expect(result).toBe(
      `Class 'MyClass' has no direct dependencies.
Available methods:
- MyClass.doSomething (no dependencies)
Retry with fully qualified method name.`,
    );
  });

  it("formats multiple methods with mixed dependency status", () => {
    const result = formatDisambiguationMessage("UserService", [
      { id: "src/user.ts:UserService.save", name: "save", hasDependencies: true },
      { id: "src/user.ts:UserService.validate", name: "validate", hasDependencies: false },
      { id: "src/user.ts:UserService.delete", name: "delete", hasDependencies: true },
    ]);

    expect(result).toBe(
      `Class 'UserService' has no direct dependencies.
Available methods:
- UserService.save
- UserService.validate (no dependencies)
- UserService.delete
Retry with fully qualified method name.`,
    );
  });

  it("formats empty methods list", () => {
    const result = formatDisambiguationMessage("EmptyClass", []);

    expect(result).toBe(
      `Class 'EmptyClass' has no direct dependencies.
Available methods:
Retry with fully qualified method name.`,
    );
  });
});
