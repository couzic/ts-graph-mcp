/**
 * Demonstrates multi-hop reference chains.
 * Pattern: function → variable → stored functions
 *
 * Expected REFERENCES edges:
 * - dispatch → userFormatters (variable access)
 * - userFormatters → formatCustomer (object property)
 * - userFormatters → formatAdmin (object property)
 *
 * Expected path (2 hops):
 * dispatch → userFormatters → formatCustomer
 */

type UserType = "customer" | "admin";

function formatCustomer(data: unknown): string {
  return `Customer: ${JSON.stringify(data)}`;
}

function formatAdmin(data: unknown): string {
  return `Admin: ${JSON.stringify(data)}`;
}

// Variable storing functions in object properties
const userFormatters: Record<UserType, (data: unknown) => string> = {
  customer: formatCustomer,
  admin: formatAdmin,
};

// Function that accesses the variable (2-hop chain)
export function dispatch(type: UserType, data: unknown): string {
  return userFormatters[type](data);
}

// Another accessor function
export function getFormatter(type: UserType): (data: unknown) => string {
  return userFormatters[type];
}
