/**
 * Validate an email address format.
 * Tests cross-module CALLS edges when called from frontend/state or backend/services.
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate that a string is non-empty after trimming.
 */
export function validateRequired(value: string): boolean {
  return value.trim().length > 0;
}
