import { cpus } from "node:os";
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

const DEFAULT_POOL_SIZE = 4;

interface PooledContext {
  context: LlamaEmbeddingContext;
  busy: boolean;
}

/**
 * Create an embedding provider using node-llama-cpp with context pooling.
 *
 * Uses CPU-only mode with multiple embedding contexts for parallel processing.
 * Vulkan GPU has a global lock that prevents parallelism, so CPU mode is faster
 * for batch embedding generation.
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
  const poolSize = config.poolSize ?? DEFAULT_POOL_SIZE;

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
  let contextPool: PooledContext[] = [];
  let ready = false;

  // Queue for callers waiting for an available context
  const waitQueue: Array<(ctx: LlamaEmbeddingContext) => void> = [];

  /**
   * Acquire an idle context from the pool, or wait if all are busy.
   */
  const acquireContext = (): Promise<LlamaEmbeddingContext> => {
    const idle = contextPool.find((pc) => !pc.busy);
    if (idle) {
      idle.busy = true;
      return Promise.resolve(idle.context);
    }
    return new Promise((resolve) => {
      waitQueue.push(resolve);
    });
  };

  /**
   * Release a context back to the pool.
   */
  const releaseContext = (context: LlamaEmbeddingContext): void => {
    const pooledCtx = contextPool.find((pc) => pc.context === context);
    if (!pooledCtx) {
      return;
    }

    const next = waitQueue.shift();
    if (next) {
      // Direct handoff to waiting caller, context stays busy
      next(pooledCtx.context);
    } else {
      pooledCtx.busy = false;
    }
  };

  /**
   * Initialize the embedding model and context pool (lazy).
   */
  const initialize = async (): Promise<void> => {
    if (ready) {
      return;
    }

    // Use CPU-only mode to enable parallel embedding generation.
    // Vulkan GPU has a global lock that serializes all operations.
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
            options.onProgress!(downloadedSize, totalSize);
          }
        : undefined,
    });

    // Load model with mmap (Direct I/O fails on some systems)
    model = await llama.loadModel({ modelPath, useDirectIo: false });

    // Create pool of embedding contexts with distributed threads
    const numCpus = cpus().length;
    const threadsPerContext = Math.max(1, Math.floor(numCpus / poolSize));

    const createdContexts: LlamaEmbeddingContext[] = [];
    try {
      for (let i = 0; i < poolSize; i++) {
        const context = await model.createEmbeddingContext({
          threads: threadsPerContext,
        });
        createdContexts.push(context);
      }
      contextPool = createdContexts.map((ctx) => ({
        context: ctx,
        busy: false,
      }));
      ready = true;
    } catch (e) {
      // Cleanup on partial failure
      for (const ctx of createdContexts) {
        await ctx.dispose();
      }
      throw e;
    }
  };

  /**
   * Generate embedding using a pooled context.
   */
  const embedWithPool = async (
    text: string,
    prefix: string,
  ): Promise<number[]> => {
    await initialize();
    const context = await acquireContext();
    try {
      const input = prefix ? `${prefix}${text}` : text;
      const embedding = await context.getEmbeddingFor(input);
      return [...embedding.vector];
    } finally {
      releaseContext(context);
    }
  };

  return {
    get ready() {
      return ready;
    },

    initialize,

    async embedQuery(text: string): Promise<number[]> {
      return embedWithPool(text, queryPrefix);
    },

    async embedDocument(text: string): Promise<number[]> {
      return embedWithPool(text, documentPrefix);
    },

    async dispose(): Promise<void> {
      // Dispose all contexts in the pool
      for (const pc of contextPool) {
        await pc.context.dispose();
      }
      contextPool = [];
      waitQueue.length = 0;

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
