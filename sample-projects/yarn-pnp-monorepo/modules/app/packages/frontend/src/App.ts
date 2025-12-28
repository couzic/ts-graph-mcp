import { type Config, validateThreshold } from "@app/shared";
import { renderButton } from "@libs/ui";

export function renderDashboard(config: Config): string {
  const threshold = validateThreshold(config.threshold);
  return renderButton("Threshold", threshold);
}
