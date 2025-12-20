/**
 * Backend API that uses the shared User type and createUser function.
 * This creates cross-module edges:
 * - USES_TYPE: backend → shared (User in function signatures)
 * - CALLS: backend → shared (createUser function call)
 */

import { type User, type Config, createUser } from "@shared/common";

const defaultConfig: Config = {
	apiUrl: "https://api.example.com",
	debug: false,
};

export function getUser(id: string): User | null {
	// Simulated database lookup
	if (id === "1") {
		return createUser("John Doe", "john@example.com");
	}
	return null;
}

export function listUsers(): User[] {
	return [
		createUser("Alice", "alice@example.com"),
		createUser("Bob", "bob@example.com"),
	];
}

export function getConfig(): Config {
	return defaultConfig;
}
