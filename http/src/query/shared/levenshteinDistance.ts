/**
 * Computes the Levenshtein (edit) distance between two strings.
 * Used for sorting search results by similarity to the searched value.
 * Case-insensitive to better handle symbol name variations.
 *
 * @example
 * levenshteinDistance("kitten", "sitting") // 3
 * levenshteinDistance("formatDate", "formatdate") // 0
 */
export const levenshteinDistance = (a: string, b: string): number => {
  // Convert to lowercase for case-insensitive comparison
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower.length === 0) {
    return bLower.length;
  }
  if (bLower.length === 0) {
    return aLower.length;
  }

  // Create two rows for the DP table (space optimization)
  // Initialize prevRow with [0, 1, 2, ..., bLower.length]
  let prevRow = Array.from({ length: bLower.length + 1 }, (_, i) => i);
  let currRow = Array.from({ length: bLower.length + 1 }, () => 0);

  for (let i = 1; i <= aLower.length; i++) {
    currRow[0] = i;

    for (let j = 1; j <= bLower.length; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      const deletion = (prevRow[j] as number) + 1;
      const insertion = (currRow[j - 1] as number) + 1;
      const substitution = (prevRow[j - 1] as number) + cost;
      currRow[j] = Math.min(deletion, insertion, substitution);
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[bLower.length] as number;
};
