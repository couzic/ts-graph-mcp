/**
 * Shared utilities for benchmark reporting.
 */

/**
 * Threshold for considering a change statistically insignificant.
 * LLM-based benchmarks have inherent variance - small differences are noise.
 */
export const NOISE_THRESHOLD_PCT = 15;

/**
 * Calculate average of numeric values.
 * Returns 0 for empty array.
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Format a metric comparison with icon.
 * Returns icon, percentage, and direction string.
 *
 * @param current - Current value (lower is better)
 * @param baseline - Baseline value to compare against
 * @param metricType - Type of metric for direction labels
 */
export function formatMetricChange(
  current: number,
  baseline: number,
  metricType: "time" | "cost",
): { icon: string; pct: string; direction: string } {
  if (baseline === 0) return { icon: "➖", pct: "N/A", direction: "" };

  const change = ((baseline - current) / baseline) * 100;
  const isImprovement = change > 0; // Lower is always better for time and cost
  const isSignificant = Math.abs(change) > NOISE_THRESHOLD_PCT;
  const icon = !isSignificant ? "➖" : isImprovement ? "✅" : "❌";
  const pct = `${Math.abs(change).toFixed(0)}%`;

  let direction: string;
  if (!isSignificant) {
    direction = "same";
  } else if (metricType === "time") {
    direction = change > 0 ? "faster" : "slower";
  } else {
    direction = change > 0 ? "cheaper" : "more expensive";
  }

  return { icon, pct, direction };
}
