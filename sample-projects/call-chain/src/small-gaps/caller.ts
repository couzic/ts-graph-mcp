import { target } from "./target.js";

/**
 * Function with multiple calls to target, separated by 1-2 lines.
 * When contextLines=0, this produces small gaps that should
 * show actual lines instead of "... N lines omitted ...".
 */
export function caller(): string {
  const a = target();
  // One line gap
  const b = target();

  const c = target();
  return `${a}-${b}-${c}`;
}
