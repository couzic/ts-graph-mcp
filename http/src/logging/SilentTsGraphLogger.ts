import type { TsGraphLogger } from "./TsGraphLogger.js";

/**
 * Silent logger that discards all output.
 * Used in tests to suppress console noise.
 */
export const silentLogger: TsGraphLogger = {
  startProgress(): void {},
  updateProgress(): void {},
  completeProgress(): void {},
  success(): void {},
  info(): void {},
  warn(): void {},
  error(): void {},
};
