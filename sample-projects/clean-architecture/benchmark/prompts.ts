/**
 * Benchmark prompts for clean-architecture test project.
 *
 * Tests graph traversal through Clean Architecture layers:
 * Controllers → UseCases → Services → Repositories
 */

import type {
  BenchmarkConfig,
  BenchmarkPrompt,
} from "../../../benchmark/lib/types.js";

export const config: BenchmarkConfig = {
  projectName: "clean-architecture",
  projectRoot: `${import.meta.dirname}/..`,
  tsconfig: "tsconfig.json",
};

export const prompts: BenchmarkPrompt[] = [
  {
    id: "FAILING_TRIGGER_DEPENDENCIES",
    name: "List usecase dependencies",
    prompt:
      "can you list the dependencies involved in the usecase: SetDefaultProviderCommand",
    expectedContains: [
      "ProviderService",
      "ProviderRepository",
      "ConfigService",
    ],
    expectedTool: "dependenciesOf",
    expectedTurns: 2,
  },
];
