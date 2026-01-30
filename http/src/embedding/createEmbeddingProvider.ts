import {
  getLlama,
  LlamaLogLevel,
  resolveModelFile,
  type Llama,
  type LlamaEmbeddingContext,
  type LlamaModel,
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
 * Handles model download, loading, and embedding generation.
 * The provider is lazy-loaded (model loads on first use).
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
  let embeddingContext: LlamaEmbeddingContext | null = null;
  let ready = false;

  /**
   * Initialize the embedding model (lazy).
   */
  const initialize = async (): Promise<void> => {
    if (ready) {
      return;
    }

    // Get or create Llama instance with suppressed logging
    // This prevents llama.cpp from writing to stderr and interfering with progress display
    llama = await getLlama({
      logLevel: LlamaLogLevel.error,
      logger: () => {}, // No-op logger to suppress all output
    });

    // Resolve model file (downloads if needed)
    // Use hf: URI scheme for Hugging Face repos
    const modelUri = `hf:${repo}/${filename}`;
    const modelPath = await resolveModelFile(modelUri, {
      directory: modelsDir,
      onProgress: options.onProgress
        ? ({ downloadedSize, totalSize }) => {
            options.onProgress!(downloadedSize, totalSize);
          }
        : undefined,
    });

    // Load model
    // Disable Direct I/O to use mmap instead (Direct I/O fails on some systems)
    model = await llama.loadModel({ modelPath, useDirectIo: false });

    // Create embedding context
    embeddingContext = await model.createEmbeddingContext();

    ready = true;
  };

  return {
    get ready() {
      return ready;
    },

    initialize,

    async embedQuery(text: string): Promise<number[]> {
      await initialize();
      if (!embeddingContext) {
        throw new Error("Embedding context not initialized");
      }
      const input = queryPrefix ? `${queryPrefix}${text}` : text;
      const embedding = await embeddingContext.getEmbeddingFor(input);
      return [...embedding.vector];
    },

    async embedDocument(text: string): Promise<number[]> {
      await initialize();
      if (!embeddingContext) {
        throw new Error("Embedding context not initialized");
      }
      const input = documentPrefix ? `${documentPrefix}${text}` : text;
      const embedding = await embeddingContext.getEmbeddingFor(input);
      return [...embedding.vector];
    },

    async dispose(): Promise<void> {
      if (embeddingContext) {
        await embeddingContext.dispose();
        embeddingContext = null;
      }
      if (model) {
        await model.dispose();
        model = null;
      }
      if (llama) {
        await llama.dispose();
        llama = null;
      }
      ready = false;
    },
  };
};
