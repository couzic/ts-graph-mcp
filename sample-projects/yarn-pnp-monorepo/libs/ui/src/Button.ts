import { formatValue } from "@libs/toolkit";

export function renderButton(label: string, value: number): string {
  return `<button>${label}: ${formatValue(value)}</button>`;
}
