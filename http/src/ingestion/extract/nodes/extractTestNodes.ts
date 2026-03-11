import { type SourceFile, SyntaxKind } from "ts-morph";
import type {
  Edge,
  Extracted,
  TestNode,
  TestSuiteNode,
} from "../../../db/Types.js";
import {
  buildTestFullPath,
  getTestCallKind,
  getTestCallName,
} from "../testCallUtils.js";

interface ExtractTestNodesResult {
  nodes: Extracted<TestSuiteNode | TestNode>[];
  edges: Edge[];
}

/**
 * Extract TestSuite and Test nodes from test files, plus CONTAINS edges.
 *
 * @spec traceability::testsuite-nodes
 * @spec traceability::test-nodes
 * @spec traceability::contains
 *
 * @example
 * extractTestNodes(sourceFile, "src/utils.test.ts")
 */
export const extractTestNodes = (
  sourceFile: SourceFile,
  filePath: string,
): ExtractTestNodesResult => {
  const nodes: Extracted<TestSuiteNode | TestNode>[] = [];
  const edges: Edge[] = [];

  const callExpressions = sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  );

  for (const call of callExpressions) {
    const kind = getTestCallKind(call);
    if (!kind) {
      continue;
    }

    const name = getTestCallName(call);
    if (!name) {
      continue;
    }

    const fullPath = buildTestFullPath(call);
    const type = kind === "describe" ? "TestSuite" : "Test";
    const id = `${filePath}:${type}:${fullPath}`;

    nodes.push({
      id,
      type,
      name,
      filePath,
      startLine: call.getStartLineNumber(),
      endLine: call.getEndLineNumber(),
      exported: false,
    });

    // CONTAINS edge from parent describe (if nested)
    if (fullPath !== name) {
      const parentPath = fullPath.slice(0, fullPath.lastIndexOf(" > "));
      edges.push({
        source: `${filePath}:TestSuite:${parentPath}`,
        target: id,
        type: "CONTAINS",
      });
    }
  }

  return { nodes, edges };
};
