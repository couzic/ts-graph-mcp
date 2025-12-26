// Terminal: receives callback and invokes it
export function validate(
  items: string[],
  callback: (value: string) => string,
): string[] {
  return items.filter((item) => item.length > 0).map(callback);
}
