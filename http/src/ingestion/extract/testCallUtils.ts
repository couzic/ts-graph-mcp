import { type CallExpression, Node as TsMorphNode } from "ts-morph";

const TEST_FILE_PATTERN = /\.(test|integration\.test|e2e\.test)\.ts$/;

/**
 * @example
 * isTestFile("src/utils.test.ts") // true
 */
export const isTestFile = (filePath: string): boolean =>
  TEST_FILE_PATTERN.test(filePath);

/**
 * Get the string argument from a `describe()` or `it()` call expression.
 *
 * @example
 * getTestCallName(describeCall) // "formatDate"
 */
export const getTestCallName = (
  callExpr: CallExpression,
): string | undefined => {
  const firstArg = callExpr.getArguments()[0];
  if (firstArg && TsMorphNode.isStringLiteral(firstArg)) {
    return firstArg.getLiteralText();
  }
  return undefined;
};

/**
 * Check if a call expression is a `describe()` or `it()` call.
 *
 * @example
 * getTestCallKind(call) // "describe" | "it" | undefined
 */
export const getTestCallKind = (
  callExpr: CallExpression,
): "describe" | "it" | undefined => {
  const expression = callExpr.getExpression();
  if (TsMorphNode.isIdentifier(expression)) {
    const name = expression.getText();
    if (name === "describe") {
      return "describe";
    }
    if (name === "it") {
      return "it";
    }
  }
  return undefined;
};

/**
 * Build the ` > `-separated full path for a test call by walking up
 * ancestor describe() calls. Includes the current call's name.
 *
 * @example
 * buildTestFullPath(itCall) // "formatDate > edge cases > handles null"
 */
export const buildTestFullPath = (callExpr: CallExpression): string => {
  const parts: string[] = [];

  const currentName = getTestCallName(callExpr);
  if (currentName) {
    parts.unshift(currentName);
  }

  let current: TsMorphNode | undefined = callExpr.getParent();
  while (current) {
    if (TsMorphNode.isCallExpression(current)) {
      const kind = getTestCallKind(current);
      if (kind === "describe") {
        const name = getTestCallName(current);
        if (name) {
          parts.unshift(name);
        }
      }
    }
    current = current.getParent();
  }

  return parts.join(" > ");
};
