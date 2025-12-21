// Three-level class hierarchy: AdminService -> UserService -> BaseService

export class BaseService {
	protected config: Record<string, unknown> = {};

	protected getConfig(key: string): unknown {
		return this.config[key];
	}
}

export class UserService extends BaseService {
	private users: Array<{ id: number; name: string }> = [];

	addUser(user: { id: number; name: string }): void {
		this.users.push(user);
	}

	getUser(id: number): { id: number; name: string } | undefined {
		return this.users.find((u) => u.id === id);
	}
}

export class AdminService extends UserService {
	deleteUser(_id: number): void {
		// Admin-only operation
	}
}
