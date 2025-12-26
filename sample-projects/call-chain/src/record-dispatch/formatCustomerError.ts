export function formatCustomerError(error: Error): string {
  return `Sorry, something went wrong: ${error.message}`;
}
