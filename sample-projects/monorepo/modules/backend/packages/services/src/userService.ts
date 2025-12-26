import type { User } from "@shared/types/User";
import { createUser } from "@shared/types/User";
import { formatDate } from "@shared/utils/formatDate";
import { validateEmail, validateRequired } from "@shared/utils/validate";

/**
 * User service response type.
 */
export interface UserServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new user with validation.
 * Tests:
 * - Cross-module USES_TYPE edge: → User (return type)
 * - Cross-module CALLS edges: → createUser, validateEmail, validateRequired
 */
export function createUserService(
  name: string,
  email: string,
): UserServiceResponse<User> {
  if (!validateRequired(name)) {
    return { success: false, error: "Name is required" };
  }

  if (!validateEmail(email)) {
    return { success: false, error: "Invalid email format" };
  }

  const user = createUser(name, email);
  return { success: true, data: user };
}

/**
 * Get user with formatted dates.
 * Tests cross-module CALLS edge: → formatDate
 */
export function getUserSummary(user: User): string {
  return `${user.name} (${user.email}) - joined ${formatDate(user.createdAt)}`;
}

/**
 * Batch create multiple users.
 * Tests USES_TYPE with User[] array type.
 */
export function createUsersService(
  userInputs: Array<{ name: string; email: string }>,
): UserServiceResponse<User[]> {
  const users: User[] = [];

  for (const input of userInputs) {
    const result = createUserService(input.name, input.email);
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    users.push(result.data);
  }

  return { success: true, data: users };
}
