import type { ProjectRegistry } from "../../ProjectRegistry.js";

export interface EdgeExtractionContext {
  filePath: string;
  package: string;
  /**
   * Registry for looking up Projects by file path.
   * Used for cross-package resolution when barrel files use path aliases
   * that need a different tsconfig context.
   */
  projectRegistry?: ProjectRegistry;
}
