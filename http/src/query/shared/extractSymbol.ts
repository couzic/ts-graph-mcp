/**
 * Extract symbol name from node ID.
 * "src/utils.ts:Function:formatDate" → "formatDate"
 * "src/models/User.ts:Method:User.save" → "User.save"
 */
export const extractSymbol = (nodeId: string): string => {
  const lastColonIndex = nodeId.lastIndexOf(":");
  if (lastColonIndex === -1) {
    return nodeId;
  }
  return nodeId.slice(lastColonIndex + 1);
};
