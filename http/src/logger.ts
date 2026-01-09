/**
 * Simple logger interface for server output.
 */
export interface Logger {
  info(message: string): void;
  error(message: string): void;
}

/**
 * Default logger that writes to console.
 */
export const consoleLogger: Logger = {
  info: (message) => console.log(message),
  error: (message) => console.error(message),
};

/**
 * Silent logger that discards all output.
 */
export const silentLogger: Logger = {
  info: () => {},
  error: () => {},
};
