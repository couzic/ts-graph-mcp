import { type Config, validateThreshold } from "@app/shared";

export function handleConfigUpdate(input: unknown): Config {
  const config = input as Config;
  return {
    ...config,
    threshold: validateThreshold(config.threshold),
  };
}
