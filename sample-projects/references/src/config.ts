/**
 * Demonstrates object property references.
 * Pattern: { handler: fn }, route config objects
 *
 * Expected REFERENCES edges:
 * - routes → handleCreate (object property)
 * - routes → handleRead (object property)
 * - routes → handleUpdate (object property)
 * - routes → handleDelete (object property)
 */

import { handleCreate, handleRead, handleUpdate, handleDelete } from "./handlers.js";

interface RouteConfig {
	path: string;
	method: string;
	handler: (data: unknown) => void;
}

// Functions are stored in object properties (not directly called)
export const routes: RouteConfig[] = [
	{ path: "/create", method: "POST", handler: handleCreate },
	{ path: "/read/:id", method: "GET", handler: handleRead as unknown as (data: unknown) => void },
	{ path: "/update/:id", method: "PUT", handler: handleUpdate as unknown as (data: unknown) => void },
	{ path: "/delete/:id", method: "DELETE", handler: handleDelete as unknown as (data: unknown) => void },
];
