/**
 * Shared types used across frontend and backend modules.
 * This file is the source of cross-module edges we're testing.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface Config {
  apiUrl: string;
  debug: boolean;
}

export function createUser(name: string, email: string): User {
  return {
    id: crypto.randomUUID(),
    name,
    email,
    createdAt: new Date(),
  };
}
