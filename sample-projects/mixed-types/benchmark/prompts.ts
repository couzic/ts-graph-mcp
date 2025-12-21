/**
 * Benchmark prompts for mixed-types test project.
 *
 * Tests type system tools that have zero benchmark coverage:
 * - P1: incomingExtends (find subclasses, transitive)
 * - P2: outgoingExtends (find parent class chain)
 * - P3: incomingImplements (find interface implementations)
 * - P4: incomingUsesType (find type consumers)
 */

import type { BenchmarkConfig, BenchmarkPrompt } from "../../../benchmark/lib/types.js";

/**
 * Configuration for the mixed-types benchmark.
 */
export const config: BenchmarkConfig = {
	projectName: "mixed-types",
	projectRoot: import.meta.dirname + "/..",
	tsconfig: "tsconfig.json",
};

export const prompts: BenchmarkPrompt[] = [
	{
		id: "P1",
		name: "Find subclasses",
		prompt:
			"What classes extend BaseService in this project, including indirect subclasses?",
		expectedContains: ["UserService", "AdminService"],
		expectedTool: "incomingExtends",
	},
	{
		id: "P2",
		name: "Find parent class chain",
		prompt:
			"What does the AdminService class extend? Trace its full inheritance chain.",
		expectedContains: ["UserService", "BaseService"],
		expectedTool: "outgoingExtends",
	},
	{
		id: "P3",
		name: "Find interface implementations",
		prompt: "What classes implement the Auditable interface?",
		expectedContains: ["AuditLog", "ActivityLog"],
		expectedTool: "incomingImplements",
	},
	{
		id: "P4",
		name: "Find type consumers",
		prompt: "What methods use the User type as a parameter?",
		expectedContains: ["addUser"],
		expectedTool: "incomingUsesType",
	},
];
