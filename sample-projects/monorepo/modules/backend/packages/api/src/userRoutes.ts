import type { User } from "@shared/types/User";
import {
  createUserService,
  getUserSummary,
  type UserServiceResponse,
} from "@backend/services/userService";

/**
 * HTTP request type (simplified).
 */
export interface Request {
  body: Record<string, unknown>;
  params: Record<string, string>;
}

/**
 * HTTP response type (simplified).
 */
export interface Response {
  status: number;
  body: unknown;
}

/**
 * Handle POST /users - create a new user.
 * Tests:
 * - Cross-package CALLS edge (within backend module): → createUserService
 * - Cross-module USES_TYPE edge: → User
 */
export function handleCreateUser(req: Request): Response {
  const { name, email } = req.body as { name: string; email: string };

  const result: UserServiceResponse<User> = createUserService(name, email);

  if (!result.success) {
    return { status: 400, body: { error: result.error } };
  }

  return { status: 201, body: result.data };
}

/**
 * Handle GET /users/:id/summary - get user summary.
 * Tests cross-package CALLS edge: → getUserSummary
 */
export function handleGetUserSummary(req: Request, user: User): Response {
  const summary = getUserSummary(user);
  return { status: 200, body: { summary } };
}

/**
 * User routes configuration.
 */
export const userRoutes = {
  "POST /users": handleCreateUser,
  "GET /users/:id/summary": handleGetUserSummary,
};
