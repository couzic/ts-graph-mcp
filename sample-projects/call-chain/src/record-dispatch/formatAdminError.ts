export function formatAdminError(error: Error): string {
  return `[ADMIN] Error: ${error.name} - ${error.message}\n${error.stack}`;
}
