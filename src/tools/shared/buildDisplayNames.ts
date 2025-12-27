import { extractSymbol } from "./extractSymbol.js";

/**
 * Build display name map, handling disambiguation when names collide.
 * Returns: Map<nodeId, displayName>
 *
 * When multiple nodes share the same name, they get #1, #2 suffixes.
 */
export const buildDisplayNames = (nodeIds: string[]): Map<string, string> => {
  const displayNames = new Map<string, string>();
  const nameCount = new Map<string, string[]>(); // name → [nodeId, ...]

  // First pass: count names
  for (const nodeId of nodeIds) {
    const name = extractSymbol(nodeId);
    const existing = nameCount.get(name);
    if (existing) {
      existing.push(nodeId);
    } else {
      nameCount.set(name, [nodeId]);
    }
  }

  // Second pass: assign display names
  for (const [name, ids] of nameCount) {
    if (ids.length === 1 && ids[0] !== undefined) {
      // Unique name - use as-is
      displayNames.set(ids[0], name);
    } else {
      // Ambiguous - add #N suffix
      ids.forEach((id, index) => {
        displayNames.set(id, `${name}#${index + 1}`);
      });
    }
  }

  return displayNames;
};
