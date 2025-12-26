import { orchestrate } from "./handlers/orchestrate.js";
import { processor } from "./lib/processor.js";

// Entry point: passes processor callback through the chain
export function entry(): string[] {
  const items = ["hello", "world", ""];
  return orchestrate(items, processor);
}
