import { extractFilePath } from "./extractFilePath.js";
import { extractSymbol } from "./extractSymbol.js";

/**
 * Extract node type from node ID.
 * "src/utils.ts:Function:formatDate" → "Function"
 */
const extractNodeType = (nodeId: string): string => {
  const firstColon = nodeId.indexOf(":");
  const lastColon = nodeId.lastIndexOf(":");
  return nodeId.slice(firstColon + 1, lastColon);
};

/**
 * Compute minimal unique file suffixes for a set of file paths.
 * Starts with filename only, adds parent directories until all are unique.
 *
 * @example
 * minimalFileSuffixes(["src/v1/api.ts", "src/v2/api.ts"])
 * // Map { "src/v1/api.ts" => "v1/api.ts", "src/v2/api.ts" => "v2/api.ts" }
 */
const minimalFileSuffixes = (filePaths: string[]): Map<string, string> => {
  const distinctPaths = [...new Set(filePaths)];
  let segments = 1;
  while (true) {
    const suffixes = distinctPaths.map((p) => {
      const parts = p.split("/");
      return parts.slice(-segments).join("/");
    });
    const unique = new Set(suffixes).size === distinctPaths.length;
    if (unique) {
      const result = new Map<string, string>();
      for (let i = 0; i < distinctPaths.length; i++) {
        const path = distinctPaths[i];
        const suffix = suffixes[i];
        if (path !== undefined && suffix !== undefined) {
          result.set(path, suffix);
        }
      }
      return result;
    }
    segments++;
  }
};

/**
 * Build display name map, handling disambiguation when names collide.
 * Returns: Map<nodeId, displayName>
 *
 * Disambiguation strategy:
 * - Types are unique → suffix with (Type)
 * - Types clash but files are unique → suffix with (filename)
 * - Both axes clash → suffix with (Type, filename)
 *
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

  // First pass: group by display name (after alias replacement)
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

  // Second pass: assign display names with context-aware disambiguation
  for (const [name, ids] of nameCount) {
    if (ids.length === 1 && ids[0] !== undefined) {
      displayNames.set(ids[0], name);
      continue;
    }

    const types = ids.map((id) => extractNodeType(id));
    const files = ids.map((id) => extractFilePath(id));

    const typesUnique = new Set(types).size === ids.length;
    const filesUnique = new Set(files).size === ids.length;

    if (typesUnique) {
      for (const id of ids) {
        displayNames.set(id, `${name} (${extractNodeType(id)})`);
      }
    } else if (filesUnique) {
      // Different files, same type
      const suffixes = minimalFileSuffixes(files);
      for (const id of ids) {
        const fileSuffix =
          suffixes.get(extractFilePath(id)) ?? extractFilePath(id);
        displayNames.set(id, `${name} (${fileSuffix})`);
      }
    } else {
      // Both axes clash — need type + file
      const suffixes = minimalFileSuffixes(files);
      for (const id of ids) {
        const fileSuffix =
          suffixes.get(extractFilePath(id)) ?? extractFilePath(id);
        displayNames.set(id, `${name} (${extractNodeType(id)}, ${fileSuffix})`);
      }
    }
  }

  return displayNames;
};
