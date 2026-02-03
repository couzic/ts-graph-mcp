import chalk from "chalk";
import type { TsGraphLogger } from "./TsGraphLogger.js";

const PREFIX = chalk.dim("[ts-graph]");
const MOVE_UP = "\x1b[1A"; // Move cursor up one line
const CLEAR_LINE = "\x1b[2K\r"; // Clear entire line and return to column 0

/**
 * Terminal-based logger with colors and in-place progress updates.
 *
 * - Progress updates overwrite the current line (in-place)
 * - Uses cursor-up movement to handle external stderr interference
 * - Completed packages print permanent lines
 * - All output goes to stderr
 */
export const createConsoleTsGraphLogger = (): TsGraphLogger => {
  let currentPackage = "";
  let currentTotal = 0;
  let isProgressActive = false;

  const clearProgress = (): void => {
    if (isProgressActive) {
      // Move up to the progress line and clear it
      process.stderr.write(`${MOVE_UP}${CLEAR_LINE}`);
      isProgressActive = false;
    }
  };

  const writeProgress = (current: number): void => {
    const progressText = `${PREFIX} ${chalk.cyan("→")} Indexing ${currentPackage}... ${current}/${currentTotal} files`;
    if (isProgressActive) {
      // Move up to previous progress line, clear it, write new progress, then newline
      process.stderr.write(`${MOVE_UP}${CLEAR_LINE}${progressText}\n`);
    } else {
      // First progress write - just write and newline
      process.stderr.write(`${progressText}\n`);
    }
    isProgressActive = true;
  };

  const writeLine = (text: string): void => {
    clearProgress();
    console.error(text);
  };

  return {
    startProgress(total: number, packageName: string): void {
      currentPackage = packageName;
      currentTotal = total;
      writeProgress(0);
    },

    updateProgress(current: number): void {
      writeProgress(current);
    },

    completeProgress(filesCount: number, symbolsCount: number): void {
      clearProgress();
      console.error(
        `${PREFIX} ${chalk.green("✓")} ${currentPackage} (${filesCount} files, ${symbolsCount} symbols)`,
      );
      currentPackage = "";
      currentTotal = 0;
    },

    success(message: string): void {
      writeLine(`${PREFIX} ${chalk.green("✓")} ${message}`);
    },

    info(message: string): void {
      writeLine(`${PREFIX} ${message}`);
    },

    warn(message: string): void {
      writeLine(`${PREFIX} ${chalk.yellow("⚠")} ${message}`);
    },

    error(message: string): void {
      writeLine(`${PREFIX} ${chalk.red("✗")} ${message}`);
    },
  };
};

/**
 * Default console logger instance.
 */
export const consoleLogger = createConsoleTsGraphLogger();
