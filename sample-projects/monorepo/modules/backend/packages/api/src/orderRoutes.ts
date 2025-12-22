import type { User } from "@shared/types/User";
import type { Config } from "@shared/types/Config";
import { formatDate } from "./formatUtils.js";

/**
 * Order type.
 */
export interface Order {
  id: string;
  userId: string;
  items: string[];
  total: number;
  createdAt: string;
}

/**
 * Handle POST /orders - create a new order.
 * Tests cross-module USES_TYPE edges: → User, Config
 * Also calls local formatDate (ambiguous with shared/utils/formatDate)
 */
export function handleCreateOrder(user: User, config: Config): Order {
  console.log(`Creating order for ${user.name} with API: ${config.apiUrl}`);

  return {
    id: crypto.randomUUID(),
    userId: user.id,
    items: [],
    total: 0,
    createdAt: formatDate(new Date()),
  };
}

/**
 * Order routes configuration.
 */
export const orderRoutes = {
  "POST /orders": handleCreateOrder,
};
