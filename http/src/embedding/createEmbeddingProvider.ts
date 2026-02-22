import {
  getLlama,
  type Llama,
  type LlamaEmbeddingContext,
  LlamaLogLevel,
  type LlamaModel,
  resolveModelFile,
} from "node-llama-cpp";
import type { EmbeddingConfig, EmbeddingProvider } from "./EmbeddingTypes.js";
import { DEFAULT_PRESET, EMBEDDING_PRESETS } from "./presets.js";

/**
 * Progress callback for model download.
 */
export type DownloadProgress = (downloaded: number, total: number) => void;

/**
 * Options for creating an embedding provider.
 */
export interface CreateEmbeddingProviderOptions {
  /** Embedding configuration */
  config?: EmbeddingConfig;
  /** Directory to store models */
  modelsDir?: string;
  /** Progress callback for model download */
  onProgress?: DownloadProgress;
}

/**
 * Create an embedding provider using node-llama-cpp.
 *
 * @example
 * const provider = await createEmbeddingProvider({
 *   modelsDir: '.ts-graph-mcp/models'
 * });
 * const embedding = await provider.embedDocument('function validateCart() {}');
 */
export const createEmbeddingProvider = async (
  options: CreateEmbeddingProviderOptions = {},
): Promise<EmbeddingProvider> => {
  const config = options.config ?? {};
  const modelsDir = options.modelsDir ?? ".ts-graph-mcp/models";

  // Resolve preset or use explicit config
  const preset = config.preset ?? DEFAULT_PRESET;
  const presetConfig = EMBEDDING_PRESETS[preset];
  if (!presetConfig && !config.repo) {
    throw new Error(
      `Unknown embedding preset: ${preset}. Available: ${Object.keys(EMBEDDING_PRESETS).join(", ")}`,
    );
  }

  const repo = config.repo ?? presetConfig?.repo ?? "";
  const filename = config.filename ?? presetConfig?.filename ?? "";
  const queryPrefix = config.queryPrefix ?? presetConfig?.queryPrefix ?? "";
  const documentPrefix =
    config.documentPrefix ?? presetConfig?.documentPrefix ?? "";

  let llama: Llama | null = null;
  let model: LlamaModel | null = null;
  let context: LlamaEmbeddingContext | null = null;
  let initialized = false;

  /**
   * Initialize the embedding model and context (lazy).
   */
  const initialize = async (): Promise<void> => {
    if (initialized) {
      return;
    }

    llama = await getLlama({
      logLevel: LlamaLogLevel.error,
      logger: () => {},
      gpu: false,
    });

    // Resolve model file (downloads if needed)
    const modelUri = `hf:${repo}/${filename}`;
    const modelPath = await resolveModelFile(modelUri, {
      directory: modelsDir,
      onProgress: options.onProgress
        ? ({ downloadedSize, totalSize }) => {
            options.onProgress?.(downloadedSize, totalSize);
          }
        : undefined,
    });

    // Load model with mmap (Direct I/O fails on some systems)
    model = await llama.loadModel({ modelPath, useDirectIo: false });

    context = await model.createEmbeddingContext();
    initialized = true;
  };

  const embed = async (text: string, prefix: string): Promise<Float32Array> => {
    await initialize();
    const input = prefix ? `${prefix}${text}` : text;
    // biome-ignore lint/style/noNonNullAssertion: initialized guarantees context is set
    const embedding = await context!.getEmbeddingFor(input);
    return new Float32Array(embedding.vector);
  };

  return {
    initialize,

    async embedQuery(text: string): Promise<Float32Array> {
      return embed(text, queryPrefix);
    },

    async embedDocument(text: string): Promise<Float32Array> {
      return embed(text, documentPrefix);
    },

    async dispose(): Promise<void> {
      if (context) {
        await context.dispose();
        context = null;
      }
      if (model) {
        await model.dispose();
        model = null;
      }
      if (llama) {
        await llama.dispose();
        llama = null;
      }
      initialized = false;
    },
  };
};
