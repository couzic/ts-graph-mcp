// The callback function that gets passed through the chain
export function processor(value: string): string {
  return value.toUpperCase();
}
