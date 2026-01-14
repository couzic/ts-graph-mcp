import type { SourceFile } from "ts-morph";
import type { Node } from "../../../db/Types.js";
import { extractArrowFunctionNodes } from "./extractArrowFunctionNodes.js";
import { extractClassNodes } from "./extractClassNodes.js";
import { extractFileNode } from "./extractFileNode.js";
import { extractFunctionNodes } from "./extractFunctionNodes.js";
import { extractInterfaceNodes } from "./extractInterfaceNodes.js";
import { extractMethodNodes } from "./extractMethodNodes.js";
import { extractPropertyNodes } from "./extractPropertyNodes.js";
import { extractTypeAliasNodes } from "./extractTypeAliasNodes.js";
import { extractVariableNodes } from "./extractVariableNodes.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";

/**
 * Extract all nodes from a source file.
 */
export const extractNodes = (
  sourceFile: SourceFile,
  context: NodeExtractionContext,
): Node[] => {
  const nodes: Node[] = [];

  // Always extract file node
  nodes.push(extractFileNode(sourceFile, context));

  // Extract top-level functions
  nodes.push(...extractFunctionNodes(sourceFile, context));

  // Extract arrow functions and function expressions
  nodes.push(...extractArrowFunctionNodes(sourceFile, context));

  // Extract classes and their members
  const classes = extractClassNodes(sourceFile, context);
  for (const classNode of classes) {
    nodes.push(classNode);

    // Extract class members
    const classDecl = sourceFile
      .getClasses()
      .find((c) => c.getName() === classNode.name);
    if (classDecl) {
      nodes.push(...extractMethodNodes(classDecl, context));
      nodes.push(...extractPropertyNodes(classDecl, context));
    }
  }

  // Extract interfaces and their properties
  const interfaces = extractInterfaceNodes(sourceFile, context);
  for (const interfaceNode of interfaces) {
    nodes.push(interfaceNode);

    // Extract interface properties
    const interfaceDecl = sourceFile
      .getInterfaces()
      .find((i) => i.getName() === interfaceNode.name);
    if (interfaceDecl) {
      nodes.push(...extractPropertyNodes(interfaceDecl, context));
    }
  }

  // Extract type aliases
  nodes.push(...extractTypeAliasNodes(sourceFile, context));

  // Extract variables
  nodes.push(...extractVariableNodes(sourceFile, context));

  return nodes;
};
