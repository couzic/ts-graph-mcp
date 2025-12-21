import type { Auditable, Entity, User } from "./types.js";

// Base class for testing EXTENDS edges
export class BaseService {
  protected id: number = 0;

  getId(): number {
    return this.id;
  }
}

// Class extending another class
export class UserService extends BaseService {
  readonly users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }
}

// Another class extending BaseService
export class AdminService extends BaseService {
  private adminLevel: number = 1;

  getAdminLevel(): number {
    return this.adminLevel;
  }
}

// Class implementing an interface
export class AuditLog implements Auditable {
  id: number = 0;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  update(): void {
    this.updatedAt = new Date();
  }
}
