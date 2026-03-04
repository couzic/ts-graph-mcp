import { describe, expect, it } from "vitest";
import { splitCamelCase } from "./splitCamelCase.js";

describe(splitCamelCase.name, () => {
  /**
   * @spec search::preprocessing.camel-case
   * @spec search.lexical::camelcase-splitting
   */
  it("splits camelCase identifiers", () => {
    expect(splitCamelCase("validateCart")).toBe("validate Cart");
  });

  /**
   * @spec search::preprocessing.pascal-case
   * @spec search.lexical::pascalcase-splitting
   */
  it("splits PascalCase identifiers", () => {
    expect(splitCamelCase("ValidateCart")).toBe("Validate Cart");
  });

  /**
   * @spec search::preprocessing.acronym
   * @spec search.lexical::acronym-splitting
   */
  it("handles uppercase acronyms", () => {
    expect(splitCamelCase("XMLParser")).toBe("XML Parser");
    expect(splitCamelCase("parseJSON")).toBe("parse JSON");
  });

  /**
   * @spec search::preprocessing.snake-case
   * @spec search.lexical::snake-case-splitting
   */
  it("handles snake_case", () => {
    expect(splitCamelCase("validate_cart")).toBe("validate cart");
  });

  /**
   * @spec search::preprocessing.kebab-case
   * @spec search.lexical::kebab-case-splitting
   */
  it("handles kebab-case", () => {
    expect(splitCamelCase("validate-cart")).toBe("validate cart");
  });

  /** @spec search.lexical::mixed-case-splitting */
  it("handles mixed styles", () => {
    expect(splitCamelCase("validate_Cart-Items")).toBe("validate Cart Items");
  });

  /**
   * @spec search::preprocessing.single-word
   * @spec search.lexical::single-word-identity
   */
  it("preserves single-word identifiers", () => {
    expect(splitCamelCase("validate")).toBe("validate");
  });

  it("handles empty string", () => {
    expect(splitCamelCase("")).toBe("");
  });
});
