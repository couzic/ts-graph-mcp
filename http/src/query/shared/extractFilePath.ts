/**
 * Extract file path from node ID.
 * "src/utils.ts:Function:formatDate" → "src/utils.ts"
 */
export const extractFilePath = (nodeId: string): string => {
  const colonIndex = nodeId.indexOf(":");
  if (colonIndex === -1) {
    return nodeId;
  }
  return nodeId.slice(0, colonIndex);
};
