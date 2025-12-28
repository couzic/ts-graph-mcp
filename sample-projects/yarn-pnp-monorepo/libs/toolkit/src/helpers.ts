export function formatValue(value: number): string {
  return value.toFixed(2);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
