import assert from "node:assert";
import { describe, expect, it } from "vitest";
import { parseFeatureFile } from "./parseFeatureFile.js";

const sampleMarkdown = `# My Feature

**Status:** In progress

**ID:** \`my-feature\`

Some description prose.

## TODO

- [Some spec](#some-spec) \`[@my-feature::some-spec]\`

## Section

### Some spec

> \`{#my-feature::some-spec}\`

This spec describes something.

### Another spec

> \`{#my-feature::another-spec}\`

This spec describes something else.
`;

const filePath = "specs/features/my-feature.feature.md";

describe(parseFeatureFile.name, () => {
  it("generates feature ID following {path}:{type}:{name} convention", () => {
    const result = parseFeatureFile(sampleMarkdown, filePath);
    expect(result.features).toHaveLength(1);
    const feature = result.features[0];
    assert(feature !== undefined);
    expect(feature.id).toBe(`${filePath}:Feature:my-feature`);
    expect(feature.type).toBe("Feature");
    expect(feature.name).toBe("my-feature");
    expect(feature.filePath).toBe(filePath);
    expect(feature.exported).toBe(false);
  });

  it("sets feature startLine to the heading line", () => {
    const result = parseFeatureFile(sampleMarkdown, filePath);
    assert(result.features[0] !== undefined);
    expect(result.features[0].startLine).toBe(1);
  });

  it("sets feature endLine to the last line of the file", () => {
    const lines = sampleMarkdown.split("\n");
    const result = parseFeatureFile(sampleMarkdown, filePath);
    assert(result.features[0] !== undefined);
    expect(result.features[0].endLine).toBe(lines.length);
  });

  it("extracts two spec nodes", () => {
    const result = parseFeatureFile(sampleMarkdown, filePath);
    expect(result.specs).toHaveLength(2);
  });

  it("extracts spec IDs correctly", () => {
    const result = parseFeatureFile(sampleMarkdown, filePath);
    assert(result.specs[0] !== undefined);
    assert(result.specs[1] !== undefined);
    expect(result.specs[0].id).toBe(`${filePath}:Spec:my-feature::some-spec`);
    expect(result.specs[1].id).toBe(
      `${filePath}:Spec:my-feature::another-spec`,
    );
  });

  it("sets spec names to the spec ID string", () => {
    const result = parseFeatureFile(sampleMarkdown, filePath);
    assert(result.specs[0] !== undefined);
    assert(result.specs[1] !== undefined);
    expect(result.specs[0].name).toBe("my-feature::some-spec");
    expect(result.specs[1].name).toBe("my-feature::another-spec");
  });

  it("sets spec type and exported flag", () => {
    const result = parseFeatureFile(sampleMarkdown, filePath);
    for (const spec of result.specs) {
      expect(spec.type).toBe("Spec");
      expect(spec.exported).toBe(false);
      expect(spec.filePath).toBe(filePath);
    }
  });

  it("sets spec startLine to the heading above the anchor line", () => {
    const result = parseFeatureFile(sampleMarkdown, filePath);
    assert(result.specs[0] !== undefined);
    expect(result.specs[0].startLine).toBe(15);
    assert(result.specs[1] !== undefined);
    expect(result.specs[1].startLine).toBe(21);
  });

  it("sets spec endLine to last line before next heading of same or higher level", () => {
    const result = parseFeatureFile(sampleMarkdown, filePath);
    assert(result.specs[0] !== undefined);
    expect(result.specs[0].endLine).toBe(20);
    assert(result.specs[1] !== undefined);
    const lines = sampleMarkdown.split("\n");
    expect(result.specs[1].endLine).toBe(lines.length);
  });

  it("creates CONTAINS edges from feature to each spec", () => {
    const result = parseFeatureFile(sampleMarkdown, filePath);
    expect(result.edges).toHaveLength(2);
    for (const edge of result.edges) {
      expect(edge.source).toBe(`${filePath}:Feature:my-feature`);
      expect(edge.type).toBe("CONTAINS");
    }
    assert(result.edges[0] !== undefined);
    assert(result.edges[1] !== undefined);
    expect(result.edges[0].target).toBe(
      `${filePath}:Spec:my-feature::some-spec`,
    );
    expect(result.edges[1].target).toBe(
      `${filePath}:Spec:my-feature::another-spec`,
    );
  });

  it("handles feature with no specs", () => {
    const markdown = `# Empty Feature

**ID:** \`empty-feature\`

Just a description, no specs here.
`;
    const result = parseFeatureFile(markdown, "specs/empty.feature.md");
    expect(result.features).toHaveLength(1);
    assert(result.features[0] !== undefined);
    expect(result.features[0].name).toBe("empty-feature");
    expect(result.specs).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("includes package when present", () => {
    const markdown = `# Packaged Feature

**ID:** \`pkg-feature\`
**Package:** \`my-package\`

Some description.

### A spec

> \`{#pkg-feature::a-spec}\`

Spec content.
`;
    const result = parseFeatureFile(markdown, "specs/pkg.feature.md");
    assert(result.features[0] !== undefined);
    expect(result.features[0].package).toBe("my-package");
    assert(result.specs[0] !== undefined);
    expect(result.specs[0].package).toBe("my-package");
  });

  it("omits package property when not present", () => {
    const result = parseFeatureFile(sampleMarkdown, filePath);
    assert(result.features[0] !== undefined);
    expect(result.features[0]).not.toHaveProperty("package");
    for (const spec of result.specs) {
      expect(spec).not.toHaveProperty("package");
    }
  });
});
