/**
 * Frontend component that uses the shared User type.
 * This creates a cross-module USES_TYPE edge: frontend → shared
 */

import type { User } from "@shared/common";

export interface UserCardProps {
  user: User;
  showEmail?: boolean;
}

export function renderUserCard(props: UserCardProps): string {
  const { user, showEmail = false } = props;
  return `
		<div class="user-card">
			<h2>${user.name}</h2>
			${showEmail ? `<p>${user.email}</p>` : ""}
		</div>
	`;
}

export function formatUserName(user: User): string {
  return user.name.toUpperCase();
}
