import type { User } from "@shared/types/User";
import { formatDate } from "@shared/utils/formatDate";

/**
 * Render a user card as HTML string.
 * Tests:
 * - Cross-module USES_TYPE edge: UserCard → User (parameter)
 * - Cross-module CALLS edge: renderUserCard → formatDate
 */
export function renderUserCard(user: User): string {
  return `
    <div class="user-card">
      <h2>${user.name}</h2>
      <p>${user.email}</p>
      <small>Joined: ${formatDate(user.createdAt)}</small>
    </div>
  `;
}

/**
 * Render a list of user cards.
 * Tests USES_TYPE edge with User[] array type.
 */
export function renderUserList(users: User[]): string {
  return users.map(renderUserCard).join("\n");
}
