import type Database from "better-sqlite3";
import type { NodeType } from "../../db/Types.js";
import { EDGE_TYPES } from "../shared/constants.js";

interface ClassMethodInfo {
  id: string;
  name: string;
  hasDependencies: boolean;
}

interface NodeTypeRow {
  type: string;
}

interface MethodRow {
  id: string;
  name: string;
}

/**
 * Check if a node is a Class type.
 */
export const isClassNode = (
  db: Database.Database,
  nodeId: string,
): boolean => {
  const sql = `SELECT type FROM nodes WHERE id = ?`;
  const row = db.prepare<[string], NodeTypeRow>(sql).get(nodeId);
  return row?.type === "Class";
};

/**
 * Find all methods of a class and check if they have dependencies.
 *
 * Methods are identified by their ID pattern: `{filePath}:{className}.{methodName}`
 */
export const findClassMethods = (
  db: Database.Database,
  classNodeId: string,
): ClassMethodInfo[] => {
  const methodIdPrefix = `${classNodeId}.`;

  const methodsSql = `
    SELECT id, name FROM nodes
    WHERE id LIKE ? AND type = 'Method'
  `;

  const methods = db
    .prepare<[string], MethodRow>(methodsSql)
    .all(`${methodIdPrefix}%`);

  if (methods.length === 0) {
    return [];
  }

  const edgeTypesPlaceholder = EDGE_TYPES.map(() => "?").join(", ");
  const checkDepsSql = `
    SELECT 1 FROM edges
    WHERE source = ? AND type IN (${edgeTypesPlaceholder})
    LIMIT 1
  `;

  return methods.map((method) => {
    const hasDeps = db
      .prepare<unknown[], unknown>(checkDepsSql)
      .get(method.id, ...EDGE_TYPES);
    return {
      id: method.id,
      name: method.name,
      hasDependencies: hasDeps !== undefined,
    };
  });
};

export type ClassMethodFallbackResult =
  | { type: "not-a-class" }
  | { type: "no-methods" }
  | { type: "single-method"; methodId: string; methodName: string }
  | { type: "multiple-methods"; methods: ClassMethodInfo[] };

/**
 * Attempt class method fallback when a class has no direct dependencies.
 *
 * - Single method with dependencies → returns that method for auto-resolution
 * - Multiple methods → returns list for disambiguation
 */
export const attemptClassMethodFallback = (
  db: Database.Database,
  nodeId: string,
): ClassMethodFallbackResult => {
  if (!isClassNode(db, nodeId)) {
    return { type: "not-a-class" };
  }

  const methods = findClassMethods(db, nodeId);

  if (methods.length === 0) {
    return { type: "no-methods" };
  }

  const methodsWithDeps = methods.filter((m) => m.hasDependencies);

  if (methodsWithDeps.length === 1) {
    const method = methodsWithDeps[0]!;
    return {
      type: "single-method",
      methodId: method.id,
      methodName: method.name,
    };
  }

  return { type: "multiple-methods", methods };
};

/**
 * Format disambiguation message for multi-method classes.
 */
export const formatDisambiguationMessage = (
  className: string,
  methods: ClassMethodInfo[],
): string => {
  const lines = [
    `Class '${className}' has no direct dependencies.`,
    "Available methods:",
  ];

  for (const method of methods) {
    const suffix = method.hasDependencies ? "" : " (no dependencies)";
    lines.push(`- ${className}.${method.name}${suffix}`);
  }

  lines.push("Retry with fully qualified method name.");

  return lines.join("\n");
};
