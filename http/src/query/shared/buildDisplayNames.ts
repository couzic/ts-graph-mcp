import { extractSymbol } from "./extractSymbol.js";

/**
 * Build display name map, handling disambiguation when names collide.
 * Returns: Map<nodeId, displayName>
 *
 * When multiple nodes share the same name, they get #1, #2 suffixes.
 * When aliasMap is provided, replaces ReturnType<typeof X> prefixes with alias names.
 *
 * @example
 * buildDisplayNames(["src/s.ts:Function:ReturnType<typeof createService>.doSomething"],
 *   new Map([["ReturnType<typeof createService>", "Service"]]));
 * // Map { "src/s.ts:Function:..." => "Service.doSomething" }
 */
export const buildDisplayNames = (
  nodeIds: string[],
  aliasMap?: Map<string, string>,
): Map<string, string> => {
  const displayNames = new Map<string, string>();
  const nameCount = new Map<string, string[]>(); // name → [nodeId, ...]

  // First pass: count names
  for (const nodeId of nodeIds) {
    let name = extractSymbol(nodeId);
    if (aliasMap) {
      for (const [syntheticName, aliasName] of aliasMap) {
        if (name === syntheticName) {
          name = aliasName;
        } else if (name.startsWith(`${syntheticName}.`)) {
          name = name.replace(syntheticName, aliasName);
        }
      }
    }
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
