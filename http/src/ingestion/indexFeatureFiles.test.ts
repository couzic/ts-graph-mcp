import { describe, expect, it } from "vitest";
import { updateSpecIdMapForFile } from "./indexFeatureFiles.js";

describe(updateSpecIdMapForFile.name, () => {
  it("adds new entries to the specIdMap", () => {
    const specIdMap = new Map<string, string>();

    updateSpecIdMapForFile(specIdMap, "specs/auth.feature.md", [
      ["auth::login", "specs/auth.feature.md:Spec:auth::login"],
    ]);

    expect(specIdMap.get("auth::login")).toBe(
      "specs/auth.feature.md:Spec:auth::login",
    );
  });

  it("removes stale entries when a spec is deleted from a feature file", () => {
    const specIdMap = new Map([
      ["feat::spec-a", "specs/feat.feature.md:Spec:feat::spec-a"],
      ["feat::spec-b", "specs/feat.feature.md:Spec:feat::spec-b"],
    ]);

    // Feature file was edited: spec-b was removed, only spec-a remains
    updateSpecIdMapForFile(specIdMap, "specs/feat.feature.md", [
      ["feat::spec-a", "specs/feat.feature.md:Spec:feat::spec-a"],
    ]);

    expect(specIdMap.has("feat::spec-a")).toBe(true);
    expect(specIdMap.has("feat::spec-b")).toBe(false);
  });

  it("does not affect entries from other files", () => {
    const specIdMap = new Map([
      ["feat::spec-a", "specs/feat.feature.md:Spec:feat::spec-a"],
      ["other::spec-x", "specs/other.feature.md:Spec:other::spec-x"],
    ]);

    updateSpecIdMapForFile(specIdMap, "specs/feat.feature.md", [
      ["feat::spec-a", "specs/feat.feature.md:Spec:feat::spec-a"],
    ]);

    expect(specIdMap.has("other::spec-x")).toBe(true);
  });
});
