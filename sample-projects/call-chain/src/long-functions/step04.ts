import { terminal } from "./terminal.js";

/**
 * A long function to test snippet truncation.
 * With 4 nodes, contextLines = floor((25-4)/2) = 10.
 * This 35-line function > 10*2 = 20, so truncation should trigger.
 * Call site at line 18 → should show lines 8-28 only.
 */
export function step04(): string {
  // Line 10
  const a = "setup";

  // Line 13
  const b = "more setup";

  // Line 16
  const c = "validation";

  // Line 19: THE CALL SITE
  const result = terminal();

  // Line 22
  const d = "post-process";

  // Line 25
  const e = "format";

  // Line 28
  const f = "cleanup";

  // Line 31
  const g = "validate";

  // Line 34
  const h = "finalize";

  // Line 37
  return `${a}${b}${c}${d}${e}${f}${g}${h}${result}-04`;
}
