export function formatValue(value: number): string {
  return value.toFixed(2);
}

export function validateInput(input: string): boolean {
  return input.length > 0;
}
