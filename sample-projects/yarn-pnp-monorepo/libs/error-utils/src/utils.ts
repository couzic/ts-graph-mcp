const UNKNOWN_ERROR = "An unknown error occurred";

export function formatError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  return UNKNOWN_ERROR;
}
