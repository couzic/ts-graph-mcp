/**
 * User repository - calls Database layer.
 * Handles user data persistence.
 */

import { query, execute, transaction } from "../db/Database";

export interface UserEntity {
	id: string;
	name: string;
	email: string;
	createdAt: Date;
}

export function findUserById(id: string): UserEntity | null {
	const result = query<UserEntity>("SELECT * FROM users WHERE id = ?", [id]);
	return result.rows[0] || null;
}

export function findUserByEmail(email: string): UserEntity | null {
	const result = query<UserEntity>("SELECT * FROM users WHERE email = ?", [
		email,
	]);
	return result.rows[0] || null;
}

export function findAllUsers(): UserEntity[] {
	const result = query<UserEntity>("SELECT * FROM users");
	return result.rows;
}

export function createUser(
	name: string,
	email: string,
): UserEntity | null {
	return transaction(() => {
		const id = crypto.randomUUID();
		execute("INSERT INTO users (id, name, email) VALUES (?, ?, ?)", [
			id,
			name,
			email,
		]);
		return findUserById(id);
	});
}

export function updateUser(
	id: string,
	name: string,
	email: string,
): boolean {
	const affected = execute(
		"UPDATE users SET name = ?, email = ? WHERE id = ?",
		[name, email, id],
	);
	return affected > 0;
}

export function deleteUser(id: string): boolean {
	const affected = execute("DELETE FROM users WHERE id = ?", [id]);
	return affected > 0;
}
