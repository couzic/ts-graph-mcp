// Simple A → B → C call chain in same file
export function funcC(): string {
  return "C";
}

export function funcB(): string {
  return funcC() + "B";
}

export function funcA(): string {
  return funcB() + "A";
}
