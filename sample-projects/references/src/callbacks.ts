/**
 * Demonstrates callback argument references.
 * Pattern: array.map(fn), array.filter(fn), array.forEach(fn)
 *
 * Expected REFERENCES edges:
 * - processItems → transformItem (callback arg)
 * - filterItems → filterActive (callback arg)
 */

import { filterActive, transformItem } from "./handlers.js";

export function processItems(items: string[]): string[] {
  // transformItem is passed as callback, not directly invoked
  return items.map(transformItem);
}

export function filterItems(
  items: Array<{ active: boolean }>,
): Array<{ active: boolean }> {
  // filterActive is passed as callback, not directly invoked
  return items.filter(filterActive);
}
