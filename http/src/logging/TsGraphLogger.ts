/**
 * Unified logging interface for ts-graph.
 *
 * Handles both progress updates (in-place terminal updates) and simple logs.
 * All output goes to stderr (standard CLI convention for status messages).
 *
 * @example
 * ```typescript
 * // Progress for package indexing
 * logger.startProgress(350, "backend");
 * logger.updateProgress(142);
 * logger.completeProgress(350, 890);
 *
 * // Simple logs
 * logger.success("Indexed 595 files in 2.3s");
 * logger.info("Watching for changes...");
 * ```
 */
export interface TsGraphLogger {
  /**
   * Start progress tracking for a package.
   * Displays: [ts-graph] → Indexing {packageName}... 0/{total} files
   */
  startProgress(total: number, packageName: string): void;

  /**
   * Update progress count (in-place terminal update).
   * Displays: [ts-graph] → Indexing {packageName}... {current}/{total} files
   */
  updateProgress(current: number): void;

  /**
   * Complete progress for current package.
   * Prints permanent line and clears progress state.
   * Displays: [ts-graph] ✓ {packageName} ({filesCount} files, {symbolsCount} symbols)
   */
  completeProgress(filesCount: number, symbolsCount: number): void;

  /**
   * Log a success message (green ✓).
   */
  success(message: string): void;

  /**
   * Log an info message (neutral).
   */
  info(message: string): void;

  /**
   * Log a warning message (yellow ⚠).
   */
  warn(message: string): void;

  /**
   * Log an error message (red ✗).
   */
  error(message: string): void;
}
