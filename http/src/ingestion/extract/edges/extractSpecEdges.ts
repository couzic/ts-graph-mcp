import type { NodeType } from "@ts-graph/shared";
import {
  type CallExpression,
  type SourceFile,
  SyntaxKind,
  Node as TsMorphNode,
} from "ts-morph";
import type { Edge } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import {
  buildTestFullPath,
  getTestCallKind,
  isTestFile,
} from "../testCallUtils.js";

/**
 * Try to extract a describe/it CallExpression from a node.
 * Handles both direct CallExpression and ExpressionStatement wrapping one.
 */
const extractTestCallExpression = (
  node: TsMorphNode,
): CallExpression | undefined => {
  if (TsMorphNode.isCallExpression(node)) {
    if (getTestCallKind(node)) {
      return node;
    }
  }
  if (TsMorphNode.isExpressionStatement(node)) {
    const expr = node.getExpression();
    if (TsMorphNode.isCallExpression(expr) && getTestCallKind(expr)) {
      return expr;
    }
  }
  return undefined;
};

/**
 * Find the enclosing test call (describe or it) for a given node in a test file.
 * Returns the target node ID for a VERIFIED_BY edge.
 */
const findEnclosingTestNodeId = (
  node: TsMorphNode,
  filePath: string,
): string | undefined => {
  let current: TsMorphNode | undefined = node;

  while (current) {
    const callExpr = extractTestCallExpression(current);
    if (callExpr) {
      const kind = getTestCallKind(callExpr);
      if (kind === "describe") {
        const fullPath = buildTestFullPath(callExpr);
        return `${filePath}:TestSuite:${fullPath}`;
      }
      if (kind === "it") {
        const fullPath = buildTestFullPath(callExpr);
        return `${filePath}:Test:${fullPath}`;
      }
    }
    current = current.getParent();
  }

  return undefined;
};

/**
 * Detect the node type from a ts-morph node.
 */
const getNodeType = (node: TsMorphNode): NodeType | undefined => {
  if (TsMorphNode.isFunctionDeclaration(node)) {
    return "Function";
  }
  if (TsMorphNode.isClassDeclaration(node)) {
    return "Class";
  }
  if (TsMorphNode.isMethodDeclaration(node)) {
    return "Method";
  }
  if (TsMorphNode.isInterfaceDeclaration(node)) {
    return "Interface";
  }
  if (TsMorphNode.isTypeAliasDeclaration(node)) {
    return "TypeAlias";
  }
  return undefined;
};

/**
 * Get the symbol name from a ts-morph node.
 * For methods, includes the class name prefix.
 */
const getSymbolName = (node: TsMorphNode): string | undefined => {
  if (TsMorphNode.isFunctionDeclaration(node)) {
    return node.getName();
  }
  if (TsMorphNode.isClassDeclaration(node)) {
    return node.getName();
  }
  if (TsMorphNode.isMethodDeclaration(node)) {
    const methodName = node.getName();
    const parent = node.getParent();
    if (TsMorphNode.isClassDeclaration(parent)) {
      const className = parent.getName();
      if (className) {
        return `${className}.${methodName}`;
      }
    }
    return methodName;
  }
  if (TsMorphNode.isInterfaceDeclaration(node)) {
    return node.getName();
  }
  if (TsMorphNode.isTypeAliasDeclaration(node)) {
    return node.getName();
  }
  return undefined;
};

/**
 * Find the graph node ID for the annotated node or its enclosing graph node
 * in an implementation file.
 */
const findImplementationTargetId = (
  annotatedNode: TsMorphNode,
  filePath: string,
): string | undefined => {
  let current: TsMorphNode | undefined = annotatedNode;

  while (current && !TsMorphNode.isSourceFile(current)) {
    // biome-ignore lint/style/noNonNullAssertion: parent exists since current is not a source file
    const isTopLevel = TsMorphNode.isSourceFile(current.getParent()!);

    // Check for variable statement (arrow functions, const declarations)
    // Only match top-level variable statements as graph nodes
    if (TsMorphNode.isVariableStatement(current) && isTopLevel) {
      const declarations = current.getDeclarationList().getDeclarations();
      const decl = declarations[0];
      if (decl) {
        const name = decl.getName();
        const initializer = decl.getInitializer();
        const nodeType: NodeType =
          initializer &&
          (TsMorphNode.isArrowFunction(initializer) ||
            TsMorphNode.isFunctionExpression(initializer))
            ? "Function"
            : "Variable";
        return generateNodeId(filePath, nodeType, name);
      }
    }

    const nodeType = getNodeType(current);
    if (nodeType) {
      const symbolName = getSymbolName(current);
      if (symbolName) {
        return generateNodeId(filePath, nodeType, symbolName);
      }
    }

    current = current.getParent();
  }

  return undefined;
};

/**
 * Extract SPECIFIES and VERIFIED_BY edges from `@spec` JSDoc annotations.
 *
 * @spec traceability::specifies
 * @spec traceability::verified-by
 *
 * Scans a source file for `@spec` JSDoc tags and creates edges linking
 * spec nodes to implementation or test nodes.
 *
 * @example
 * const edges = extractSpecEdges(sourceFile, "src/utils.ts", specIdMap);
 * // [{ source: "specs/tool.feature.md:tool::forward-traversal",
 * //    target: "src/utils.ts:Function:traverse",
 * //    type: "SPECIFIES" }]
 */
export const extractSpecEdges = (
  sourceFile: SourceFile,
  filePath: string,
  specIdMap: Map<string, string>,
): Edge[] => {
  const edges: Edge[] = [];
  const testFile = isTestFile(filePath);

  const jsDocs = sourceFile.getDescendantsOfKind(SyntaxKind.JSDoc);

  for (const jsDoc of jsDocs) {
    const tags = jsDoc.getTags();

    for (const tag of tags) {
      if (tag.getTagName() !== "spec") {
        continue;
      }

      const specId = tag.getCommentText()?.trim();
      if (!specId) {
        continue;
      }

      const specNodeId = specIdMap.get(specId);
      if (!specNodeId) {
        continue;
      }

      // The JSDoc is attached to its parent node
      const annotatedNode = jsDoc.getParent();
      if (!annotatedNode) {
        continue;
      }

      if (testFile) {
        const targetId = findEnclosingTestNodeId(annotatedNode, filePath);
        if (targetId) {
          edges.push({
            source: specNodeId,
            target: targetId,
            type: "VERIFIED_BY",
          });
        }
      } else {
        const targetId = findImplementationTargetId(annotatedNode, filePath);
        if (targetId) {
          edges.push({
            source: specNodeId,
            target: targetId,
            type: "SPECIFIES",
          });
        }
      }
    }
  }

  return edges;
};
