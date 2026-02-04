import { describe, expect, it } from "vitest";
import { stripClassImplementation } from "./stripClassImplementation.js";

describe("stripClassImplementation", () => {
  it("replaces method body with ellipsis", () => {
    const input = `class UserService {
  findUser(id: string): User {
    const user = this.db.find(id);
    return user;
  }
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserService {
  findUser(id: string): User { ... }
}`);
  });

  it("handles async methods", () => {
    const input = `class UserService {
  async findUser(id: string): Promise<User> {
    const result = await this.db.query(id);
    return result.rows[0];
  }
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserService {
  async findUser(id: string): Promise<User> { ... }
}`);
  });

  it("preserves property declarations", () => {
    const input = `class UserService {
  private db: Database;
  public readonly name: string = "UserService";

  findUser(id: string): User {
    return this.db.find(id);
  }
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserService {
  private db: Database;
  public readonly name: string = "UserService";

  findUser(id: string): User { ... }
}`);
  });

  it("handles multiple methods", () => {
    const input = `class UserService {
  findUser(id: string): User {
    return this.db.find(id);
  }

  saveUser(user: User): void {
    this.db.save(user);
    this.emit('saved', user);
  }
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserService {
  findUser(id: string): User { ... }

  saveUser(user: User): void { ... }
}`);
  });

  it("handles constructor", () => {
    const input = `class UserService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.init();
  }
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserService {
  private db: Database;

  constructor(db: Database) { ... }
}`);
  });

  it("handles getter and setter", () => {
    const input = `class UserService {
  private _name: string;

  get name(): string {
    return this._name;
  }

  set name(value: string) {
    this._name = value;
  }
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserService {
  private _name: string;

  get name(): string { ... }

  set name(value: string) { ... }
}`);
  });

  it("handles static methods", () => {
    const input = `class UserService {
  static create(): UserService {
    return new UserService();
  }
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserService {
  static create(): UserService { ... }
}`);
  });

  it("handles methods with decorators", () => {
    const input = `class UserController {
  @Get(':id')
  @Authorized()
  async getUser(id: string): Promise<User> {
    return this.service.findUser(id);
  }
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserController {
  @Get(':id')
  @Authorized()
  async getUser(id: string): Promise<User> { ... }
}`);
  });

  it("preserves class declaration with extends and implements", () => {
    const input = `class UserService extends BaseService implements IUserService {
  findUser(id: string): User {
    return this.db.find(id);
  }
}`;

    const result = stripClassImplementation(input);

    expect(
      result,
    ).toBe(`class UserService extends BaseService implements IUserService {
  findUser(id: string): User { ... }
}`);
  });

  it("handles method with no return type annotation", () => {
    const input = `class UserService {
  findUser(id: string) {
    return this.db.find(id);
  }
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserService {
  findUser(id: string) { ... }
}`);
  });

  it("handles nested braces in method body", () => {
    const input = `class UserService {
  findUser(id: string): User {
    if (id) {
      const user = { name: "test" };
      return user;
    }
    return null;
  }
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserService {
  findUser(id: string): User { ... }
}`);
  });

  it("handles arrow function properties", () => {
    const input = `class UserService {
  private handler = (id: string) => {
    return this.db.find(id);
  };
}`;

    const result = stripClassImplementation(input);

    expect(result).toBe(`class UserService {
  private handler = (id: string) => { ... };
}`);
  });
});
