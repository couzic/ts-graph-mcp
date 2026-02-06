import type { SourceFile } from "ts-morph";
import type { ExtractedNode } from "../../../db/Types.js";
import { extractArrowFunctionNodes } from "./extractArrowFunctionNodes.js";
import { extractClassNodes } from "./extractClassNodes.js";
import { extractFunctionNodes } from "./extractFunctionNodes.js";
import { extractInterfaceNodes } from "./extractInterfaceNodes.js";
import { extractMethodNodes } from "./extractMethodNodes.js";
import { extractObjectLiteralMethodNodes } from "./extractObjectLiteralMethodNodes.js";
import { extractTypeAliasNodes } from "./extractTypeAliasNodes.js";
import { extractVariableNodes } from "./extractVariableNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

/**
 * Extract all nodes from a source file.
 */
export const extractNodes = (
  sourceFile: SourceFile,
  context: NodeExtractionContext,
): ExtractedNode[] => {
  const nodes: ExtractedNode[] = [];

  // Extract top-level functions
  nodes.push(...extractFunctionNodes(sourceFile, context));

  // Extract arrow functions and function expressions
  nodes.push(...extractArrowFunctionNodes(sourceFile, context));

  // Extract classes and their methods
  const classes = extractClassNodes(sourceFile, context);
  for (const classNode of classes) {
    nodes.push(classNode);

    // Extract class methods (skip properties - they don't add value to graph traversal)
    const classDecl = sourceFile
      .getClasses()
      .find((c) => c.getName() === classNode.name);
    if (classDecl) {
      nodes.push(...extractMethodNodes(classDecl, context));
    }
  }

  // Extract interfaces (skip properties - they don't add value to graph traversal)
  nodes.push(...extractInterfaceNodes(sourceFile, context));

  // Extract type aliases
  nodes.push(...extractTypeAliasNodes(sourceFile, context));

  // Extract variables
  nodes.push(...extractVariableNodes(sourceFile, context));

  // Extract object literal methods
  nodes.push(...extractObjectLiteralMethodNodes(sourceFile, context));

  return nodes;
};
