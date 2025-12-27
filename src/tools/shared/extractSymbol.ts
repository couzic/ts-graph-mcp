/**
 * Extract symbol name from node ID.
 * "src/utils.ts:formatDate" → "formatDate"
 * "src/models/User.ts:User.save" → "User.save"
 */
export const extractSymbol = (nodeId: string): string => {
  const colonIndex = nodeId.indexOf(":");
  if (colonIndex === -1) return nodeId;
  return nodeId.slice(colonIndex + 1);
};
