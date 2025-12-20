/**
 * User controller - calls UserService.
 * Handles HTTP request/response logic for user endpoints.
 */

import {
	getUserById,
	getUserByEmail,
	listUsers,
	registerUser,
	modifyUser,
	removeUser,
	type User,
} from "../services/UserService";

export interface HttpRequest {
	params: Record<string, string>;
	query: Record<string, string>;
	body: unknown;
}

export interface HttpResponse {
	status: number;
	body: unknown;
}

export function handleGetUser(req: HttpRequest): HttpResponse {
	const { id } = req.params;
	const user = getUserById(id);

	if (!user) {
		return { status: 404, body: { error: "User not found" } };
	}

	return { status: 200, body: user };
}

export function handleSearchUser(req: HttpRequest): HttpResponse {
	const { email } = req.query;

	if (email) {
		const user = getUserByEmail(email);
		return user
			? { status: 200, body: [user] }
			: { status: 200, body: [] };
	}

	const users = listUsers();
	return { status: 200, body: users };
}

export function handleCreateUser(req: HttpRequest): HttpResponse {
	const { name, email } = req.body as { name: string; email: string };

	try {
		const user = registerUser(name, email);
		return { status: 201, body: user };
	} catch (error) {
		return {
			status: 400,
			body: { error: (error as Error).message },
		};
	}
}

export function handleUpdateUser(req: HttpRequest): HttpResponse {
	const { id } = req.params;
	const { name, email } = req.body as { name: string; email: string };

	try {
		const success = modifyUser(id, name, email);
		return success
			? { status: 200, body: { message: "User updated" } }
			: { status: 404, body: { error: "User not found" } };
	} catch (error) {
		return {
			status: 400,
			body: { error: (error as Error).message },
		};
	}
}

export function handleDeleteUser(req: HttpRequest): HttpResponse {
	const { id } = req.params;
	const success = removeUser(id);

	return success
		? { status: 200, body: { message: "User deleted" } }
		: { status: 404, body: { error: "User not found" } };
}
