/**
 * Record dispatch pattern: functions stored in a Record keyed by type alias.
 *
 * Pattern under test:
 * - Type alias defines allowed keys
 * - Record stores functions as values
 * - Dispatch function accesses via bracket notation
 *
 * Expected edges:
 * - formatErrorMessage REFERENCES formatMessageByAccessLevel (variable access)
 * - formatMessageByAccessLevel REFERENCES formatCustomerError (object property)
 * - formatMessageByAccessLevel REFERENCES formatAdminError (object property)
 */

import { formatAdminError } from "./formatAdminError.js";
import { formatCustomerError } from "./formatCustomerError.js";

export type AccessLevel = "customer" | "admin";

const formatMessageByAccessLevel: Record<
  AccessLevel,
  (error: Error) => string
> = {
  customer: formatCustomerError,
  admin: formatAdminError,
};

export function formatErrorMessage(
  accessLevel: AccessLevel,
  error: Error,
): string {
  return formatMessageByAccessLevel[accessLevel](error);
}
