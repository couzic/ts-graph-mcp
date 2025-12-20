/**
 * User service - calls UserRepository.
 * Implements business logic for user operations.
 */

import {
	findUserById,
	findUserByEmail,
	findAllUsers,
	createUser,
	updateUser,
	deleteUser,
	type UserEntity,
} from "../repositories/UserRepository";

export interface User {
	id: string;
	name: string;
	email: string;
	createdAt: Date;
}

export function getUserById(id: string): User | null {
	const entity = findUserById(id);
	return entity ? mapToUser(entity) : null;
}

export function getUserByEmail(email: string): User | null {
	const entity = findUserByEmail(email);
	return entity ? mapToUser(entity) : null;
}

export function listUsers(): User[] {
	const entities = findAllUsers();
	return entities.map(mapToUser);
}

export function registerUser(
	name: string,
	email: string,
): User | null {
	// Business logic: validate email format
	if (!isValidEmail(email)) {
		throw new Error("Invalid email format");
	}

	// Check for existing user
	if (findUserByEmail(email)) {
		throw new Error("User already exists");
	}

	const entity = createUser(name, email);
	return entity ? mapToUser(entity) : null;
}

export function modifyUser(
	id: string,
	name: string,
	email: string,
): boolean {
	// Business logic: validate email format
	if (!isValidEmail(email)) {
		throw new Error("Invalid email format");
	}

	return updateUser(id, name, email);
}

export function removeUser(id: string): boolean {
	return deleteUser(id);
}

function mapToUser(entity: UserEntity): User {
	return {
		id: entity.id,
		name: entity.name,
		email: entity.email,
		createdAt: entity.createdAt,
	};
}

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
