/**
 * Embedding model preset configuration.
 */
export interface EmbeddingModelPreset {
  /** Hugging Face repository path */
  repo: string;
  /** GGUF filename to download */
  filename: string;
  /** Vector dimensions for this model */
  dimensions: number;
  /** Query prefix for better results (some models require this) */
  queryPrefix?: string;
  /** Document prefix for indexing (some models require this) */
  documentPrefix?: string;
}

/**
 * User-configurable embedding settings.
 */
export interface EmbeddingConfig {
  /** Preset name (e.g., "qwen3-0.6b") */
  preset?: string;
  /** OR explicit configuration: */
  /** Hugging Face repo path */
  repo?: string;
  /** GGUF filename */
  filename?: string;
  /** Query prefix */
  queryPrefix?: string;
  /** Document prefix */
  documentPrefix?: string;
}

/**
 * Embedding provider interface.
 * Abstracts the embedding generation so it can be swapped out.
 */
export interface EmbeddingProvider {
  /** Initialize the provider (downloads model if needed). Call before indexing. */
  initialize(): Promise<void>;
  /** Generate embedding for a query (for search) */
  embedQuery(text: string): Promise<number[]>;
  /** Generate embedding for a document (for indexing) */
  embedDocument(text: string): Promise<number[]>;
  /** Dispose of resources */
  dispose(): Promise<void>;
  /** Check if provider is ready */
  readonly ready: boolean;
}
