import { type Config, validateThreshold } from "@app/shared";
import { LoadingWrapper, renderButton } from "@libs/ui";

export function renderDashboard(config: Config): string {
  const threshold = validateThreshold(config.threshold);
  return renderButton("Threshold", threshold);
}

export function renderLoading(value: number) {
  return <LoadingWrapper>{value}</LoadingWrapper>;
}
