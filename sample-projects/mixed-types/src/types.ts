// Interface node
export interface User {
  id: number;
  name: string;
}

// Type alias node
export type UserId = number;

// Base interface for testing EXTENDS edges
export interface Entity {
  id: number;
}

// Interface extending another interface
export interface Auditable extends Entity {
  createdAt: Date;
  updatedAt: Date;
}
