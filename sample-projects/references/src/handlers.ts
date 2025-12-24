/**
 * Handler functions that will be referenced (not directly called) by other files.
 * These are the "targets" for REFERENCES edges.
 */

export function handleCreate(data: unknown): void {
	console.log("Creating:", data);
}

export function handleRead(id: string): void {
	console.log("Reading:", id);
}

export function handleUpdate(id: string, data: unknown): void {
	console.log("Updating:", id, data);
}

export function handleDelete(id: string): void {
	console.log("Deleting:", id);
}

export function validateInput(input: unknown): boolean {
	return input != null;
}

export function formatOutput(data: unknown): string {
	return JSON.stringify(data);
}

export function logError(error: Error): void {
	console.error("Error:", error.message);
}

export function transformItem(item: string): string {
	return item.toUpperCase();
}

export function filterActive(item: { active: boolean }): boolean {
	return item.active;
}
