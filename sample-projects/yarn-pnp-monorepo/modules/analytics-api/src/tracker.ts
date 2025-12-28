import type { Config } from "@app/shared";
import { formatValue } from "@libs/toolkit";

export function trackMetric(
  name: string,
  value: number,
  config: Config,
): string {
  return `${name}=${formatValue(value)}, max=${config.maxItems}`;
}
