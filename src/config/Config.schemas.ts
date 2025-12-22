import { z } from "zod";

// --- Schemas ---

export const PackageConfigSchema = z.object({
	/** Package name (unique within module) */
	name: z.string().min(1),
	/** Path to tsconfig.json (relative to project root) */
	tsconfig: z.string().min(1),
});

export const ModuleConfigSchema = z.object({
	/** Module name (unique within project) */
	name: z.string().min(1),
	/** Packages in this module */
	packages: z.array(PackageConfigSchema).min(1),
});

export const SqliteStorageSchema = z.object({
	type: z.literal("sqlite"),
	/** Path to database file (default: '.ts-graph-mcp/graph.db') */
	path: z.string().optional(),
});

export const MemgraphStorageSchema = z.object({
	type: z.literal("memgraph"),
	/** Memgraph host (default: 'localhost') */
	host: z.string().optional(),
	/** Memgraph port (default: 7687) */
	port: z.number().int().positive().optional(),
	/** Username (optional) */
	username: z.string().optional(),
	/** Password (optional) */
	password: z.string().optional(),
});

export const StorageConfigSchema = z.discriminatedUnion("type", [
	SqliteStorageSchema,
	MemgraphStorageSchema,
]);

export const WatchConfigSchema = z.object({
	/** Patterns to include */
	include: z.array(z.string()).optional(),
	/** Patterns to exclude */
	exclude: z.array(z.string()).optional(),
	/** Debounce delay in ms */
	debounce: z.number().int().nonnegative().optional(),
});

/** Full format with explicit modules */
const FullProjectConfigSchema = z.object({
	/** Modules in the project */
	modules: z.array(ModuleConfigSchema).min(1),
	/** Storage configuration (default: sqlite) */
	storage: StorageConfigSchema.optional(),
	/** Watch mode configuration */
	watch: WatchConfigSchema.optional(),
});

/** Flat format: packages without module nesting (creates implicit "main" module) */
const FlatProjectConfigSchema = z.object({
	/** Packages in the project (will be placed in implicit "main" module) */
	packages: z.array(PackageConfigSchema).min(1),
	/** Storage configuration (default: sqlite) */
	storage: StorageConfigSchema.optional(),
	/** Watch mode configuration */
	watch: WatchConfigSchema.optional(),
});

/** Input schema accepts either full or flat format */
export const ProjectConfigInputSchema = z.union([
	FullProjectConfigSchema,
	FlatProjectConfigSchema,
]);

/** Output schema is always the full format */
export const ProjectConfigSchema = FullProjectConfigSchema;

// --- Inferred Types ---

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ProjectConfigInput = z.infer<typeof ProjectConfigInputSchema>;
