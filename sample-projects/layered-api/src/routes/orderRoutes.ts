/**
 * Order routes - calls OrderController.
 * Defines HTTP routing for order endpoints.
 */

import {
  type HttpRequest,
  type HttpResponse,
  handleCancelOrder,
  handleCompleteOrder,
  handleCreateOrder,
  handleDeleteOrder,
  handleGetOrder,
  handleListOrders,
} from "../controllers/OrderController";

export interface Route {
  method: string;
  path: string;
  handler: (req: HttpRequest) => HttpResponse;
}

export const orderRoutes: Route[] = [
  {
    method: "GET",
    path: "/orders/:id",
    handler: handleGetOrder,
  },
  {
    method: "GET",
    path: "/orders",
    handler: handleListOrders,
  },
  {
    method: "POST",
    path: "/orders",
    handler: handleCreateOrder,
  },
  {
    method: "POST",
    path: "/orders/:id/cancel",
    handler: handleCancelOrder,
  },
  {
    method: "POST",
    path: "/orders/:id/complete",
    handler: handleCompleteOrder,
  },
  {
    method: "DELETE",
    path: "/orders/:id",
    handler: handleDeleteOrder,
  },
];

export function registerOrderRoutes(): Route[] {
  return orderRoutes;
}
