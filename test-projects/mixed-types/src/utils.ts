// Variable node (const) without explicit type
export const DEFAULT_NAME = "Anonymous";

// Variable node (const) with explicit type annotation
export const MAX_RETRIES: number = 3;

// Function node with explicit return type
export function greet(name: string): string {
  return `Hello, ${name}`;
}

// Function without return type annotation (implicit void)
export function logMessage(message: string) {
  console.log(message);
}

// Async function with return type
export async function fetchData(url: string): Promise<string> {
  return url;
}

// Async function without return type annotation
export async function processData(data: string) {
  console.log(data);
}
