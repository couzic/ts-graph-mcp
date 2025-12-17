/**
 * Core User interface used across the entire monorepo.
 * This is the primary type for testing cross-module USES_TYPE edges.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

/**
 * Factory function to create a User.
 * Tests cross-module CALLS edges when called from other modules.
 */
export function createUser(name: string, email: string): User {
  return {
    id: crypto.randomUUID(),
    name,
    email,
    createdAt: new Date(),
  };
}
