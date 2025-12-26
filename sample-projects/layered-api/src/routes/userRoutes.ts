/**
 * User routes - calls UserController.
 * Defines HTTP routing for user endpoints.
 */

import {
  type HttpRequest,
  type HttpResponse,
  handleCreateUser,
  handleDeleteUser,
  handleGetUser,
  handleSearchUser,
  handleUpdateUser,
} from "../controllers/UserController";

export interface Route {
  method: string;
  path: string;
  handler: (req: HttpRequest) => HttpResponse;
}

export const userRoutes: Route[] = [
  {
    method: "GET",
    path: "/users/:id",
    handler: handleGetUser,
  },
  {
    method: "GET",
    path: "/users",
    handler: handleSearchUser,
  },
  {
    method: "POST",
    path: "/users",
    handler: handleCreateUser,
  },
  {
    method: "PUT",
    path: "/users/:id",
    handler: handleUpdateUser,
  },
  {
    method: "DELETE",
    path: "/users/:id",
    handler: handleDeleteUser,
  },
];

export function registerUserRoutes(): Route[] {
  return userRoutes;
}
