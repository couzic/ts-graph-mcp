// Consumer imports from barrel file and calls the function
import { formatValue } from "./index";

export function displayValue(n: number): string {
  return `Value: ${formatValue(n)}`;
}
