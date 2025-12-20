/**
 * Format a Date object as a human-readable string.
 * Tests cross-module CALLS edges when called from backend/services.
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Format a Date with time component.
 */
export function formatDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}
