/**
 * Local formatting utilities for the API layer.
 * Intentionally duplicates some shared/utils functions to test ambiguous symbol resolution.
 */

import type { User } from "../../../../shared/packages/types/src/User.js";

/**
 * Format a date for API responses (ISO format with timezone).
 * Different from shared/utils/formatDate which uses locale format.
 */
export function formatDate(date: Date): string {
	return date.toISOString();
}

/**
 * Format a user for API response.
 */
export function formatUserResponse(user: User): string {
	return `User: ${user.name} (${user.email})`;
}
