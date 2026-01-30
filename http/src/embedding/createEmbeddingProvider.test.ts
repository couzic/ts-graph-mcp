import { describe, expect, it } from "vitest";
import { DEFAULT_PRESET, EMBEDDING_PRESETS } from "./presets.js";

describe("Embedding presets", () => {
  it("has a default preset defined", () => {
    expect(DEFAULT_PRESET).toBeDefined();
    expect(EMBEDDING_PRESETS[DEFAULT_PRESET]).toBeDefined();
  });

  it("all presets have required fields", () => {
    for (const [name, preset] of Object.entries(EMBEDDING_PRESETS)) {
      expect(preset.repo, `${name} missing repo`).toBeTruthy();
      expect(preset.filename, `${name} missing filename`).toBeTruthy();
    }
  });

  it("presets with prefixes have both query and document prefix", () => {
    for (const [name, preset] of Object.entries(EMBEDDING_PRESETS)) {
      if (preset.queryPrefix || preset.documentPrefix) {
        expect(preset.queryPrefix, `${name} missing queryPrefix`).toBeTruthy();
        expect(
          preset.documentPrefix,
          `${name} missing documentPrefix`,
        ).toBeTruthy();
      }
    }
  });
});

// Note: Integration tests for createEmbeddingProvider require model download
// and are not suitable for CI. Run manually with:
// npm test -- --run http/src/embedding/createEmbeddingProvider.test.ts --testTimeout=120000
//
// Uncomment below to run integration tests locally:
//
// describe("createEmbeddingProvider", () => {
//   it("generates embeddings", async () => {
//     const provider = await createEmbeddingProvider({
//       modelsDir: ".ts-graph-mcp/models",
//     });
//     try {
//       const embedding = await provider.embedDocument("function validate() {}");
//       expect(embedding.length).toBeGreaterThan(0);
//       expect(embedding.every((v) => typeof v === "number")).toBe(true);
//     } finally {
//       await provider.dispose();
//     }
//   }, 120000);
// });
