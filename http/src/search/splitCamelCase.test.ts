import { describe, expect, it } from "vitest";
import { splitCamelCase } from "./splitCamelCase.js";

describe(splitCamelCase.name, () => {
  it("splits camelCase identifiers", () => {
    expect(splitCamelCase("validateCart")).toBe("validate Cart");
  });

  it("splits PascalCase identifiers", () => {
    expect(splitCamelCase("ValidateCart")).toBe("Validate Cart");
  });

  it("handles uppercase acronyms", () => {
    expect(splitCamelCase("XMLParser")).toBe("XML Parser");
    expect(splitCamelCase("parseJSON")).toBe("parse JSON");
  });

  it("handles snake_case", () => {
    expect(splitCamelCase("validate_cart")).toBe("validate cart");
  });

  it("handles kebab-case", () => {
    expect(splitCamelCase("validate-cart")).toBe("validate cart");
  });

  it("handles mixed styles", () => {
    expect(splitCamelCase("validate_Cart-Items")).toBe("validate Cart Items");
  });

  it("preserves single-word identifiers", () => {
    expect(splitCamelCase("validate")).toBe("validate");
  });

  it("handles empty string", () => {
    expect(splitCamelCase("")).toBe("");
  });
});
