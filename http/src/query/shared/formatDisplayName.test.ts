import { describe, expect, it } from "vitest";
import {
  type DisplayNameContext,
  formatDisplayName,
} from "./formatDisplayName.js";

describe("formatDisplayName", () => {
  const emptyContext: DisplayNameContext = {
    typeByNodeId: new Map(),
    includesTargets: new Set(),
  };

  describe("functions and methods", () => {
    it("adds parentheses to Function type", () => {
      const context: DisplayNameContext = {
        ...emptyContext,
        typeByNodeId: new Map([["src/api.ts:Function:handler", "Function"]]),
      };

      const result = formatDisplayName(
        "src/api.ts:Function:handler",
        "handler",
        context,
      );

      expect(result).toBe("handler()");
    });

    it("adds parentheses to Method type", () => {
      const context: DisplayNameContext = {
        ...emptyContext,
        typeByNodeId: new Map([["src/User.ts:Method:User.save", "Method"]]),
      };

      const result = formatDisplayName(
        "src/User.ts:Method:User.save",
        "User.save",
        context,
      );

      expect(result).toBe("User.save()");
    });
  });

  describe("variables", () => {
    it("does not add parentheses to Variable type", () => {
      const context: DisplayNameContext = {
        ...emptyContext,
        typeByNodeId: new Map([["src/config.ts:Variable:config", "Variable"]]),
      };

      const result = formatDisplayName(
        "src/config.ts:Variable:config",
        "config",
        context,
      );

      expect(result).toBe("config");
    });
  });

  describe("React components (INCLUDES targets)", () => {
    it("wraps INCLUDES target with HTML-escaped angle brackets", () => {
      const context: DisplayNameContext = {
        ...emptyContext,
        typeByNodeId: new Map([["src/Button.tsx:Function:Button", "Function"]]),
        includesTargets: new Set(["src/Button.tsx:Function:Button"]),
      };

      const result = formatDisplayName(
        "src/Button.tsx:Function:Button",
        "Button",
        context,
      );

      expect(result).toBe("&lt;Button&gt;");
    });

    it("component takes precedence over function parentheses", () => {
      const context: DisplayNameContext = {
        ...emptyContext,
        typeByNodeId: new Map([["src/App.tsx:Function:App", "Function"]]),
        includesTargets: new Set(["src/App.tsx:Function:App"]),
      };

      const result = formatDisplayName(
        "src/App.tsx:Function:App",
        "App",
        context,
      );

      expect(result).toBe("&lt;App&gt;");
    });
  });

  describe("other types remain unchanged", () => {
    it("Class type unchanged", () => {
      const context: DisplayNameContext = {
        ...emptyContext,
        typeByNodeId: new Map([["src/User.ts:Class:User", "Class"]]),
      };

      const result = formatDisplayName(
        "src/User.ts:Class:User",
        "User",
        context,
      );

      expect(result).toBe("User");
    });

    it("Interface type unchanged", () => {
      const context: DisplayNameContext = {
        ...emptyContext,
        typeByNodeId: new Map([["src/types.ts:Interface:Config", "Interface"]]),
      };

      const result = formatDisplayName(
        "src/types.ts:Interface:Config",
        "Config",
        context,
      );

      expect(result).toBe("Config");
    });

    it("TypeAlias type unchanged", () => {
      const context: DisplayNameContext = {
        ...emptyContext,
        typeByNodeId: new Map([["src/types.ts:TypeAlias:UserId", "TypeAlias"]]),
      };

      const result = formatDisplayName(
        "src/types.ts:TypeAlias:UserId",
        "UserId",
        context,
      );

      expect(result).toBe("UserId");
    });
  });

  describe("fallback behavior", () => {
    it("returns name unchanged when no type info available", () => {
      const result = formatDisplayName(
        "src/unknown.ts:Function:unknown",
        "unknown",
        emptyContext,
      );

      expect(result).toBe("unknown");
    });
  });
});
