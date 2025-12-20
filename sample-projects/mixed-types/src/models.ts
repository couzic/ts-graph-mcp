import type { User } from "./types.js";

// Class node with property and method nodes
export class UserService {
  readonly users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }
}
