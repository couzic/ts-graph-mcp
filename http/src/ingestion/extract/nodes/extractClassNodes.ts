import type { SourceFile } from "ts-morph";
import type { ClassNode, Extracted } from "../../../db/Types.js";
import { generateNodeId } from "../../generateNodeId.js";
import type { NodeExtractionContext } from "./NodeExtractionContext.js";
import { normalizeTypeText } from "./normalizeTypeText.js";

/**
 * Extract class nodes from a source file.
 */
export const extractClassNodes = (
  sourceFile: SourceFile,
  context: NodeExtractionContext,
): Extracted<ClassNode>[] => {
  const classes = sourceFile.getClasses();
  return classes.map((classDecl) => {
    const name = classDecl.getName() || "<anonymous>";
    const startLine = classDecl.getStartLineNumber();
    const endLine = classDecl.getEndLineNumber();
    const exported = classDecl.isExported();

    // Extract extends clause
    const extendsClause = classDecl.getExtends();
    const extendsName = normalizeTypeText(extendsClause?.getText());

    // Extract implements clauses
    const implementsClauses = classDecl.getImplements();
    const implementsNames =
      implementsClauses.length > 0
        ? implementsClauses.map(
            (impl) => normalizeTypeText(impl.getText()) as string,
          )
        : undefined;

    return {
      id: generateNodeId(context.filePath, "Class", name),
      type: "Class",
      name,
      package: context.package,
      filePath: context.filePath,
      startLine,
      endLine,
      exported,
      extends: extendsName,
      implements: implementsNames,
    };
  });
};
