import type { User } from "@shared/types/User";
import { validateEmail } from "@shared/utils/validate";

/**
 * User store state type.
 */
export interface UserStoreState {
  users: User[];
  currentUser: User | null;
  loading: boolean;
}

/**
 * Create a user store with basic state management.
 * Tests:
 * - Cross-module USES_TYPE edge: UserStoreState → User
 * - Cross-module CALLS edge: addUser → validateEmail
 */
export function createUserStore() {
  const state: UserStoreState = {
    users: [],
    currentUser: null,
    loading: false,
  };

  return {
    getState: () => state,

    addUser: (user: User): boolean => {
      if (!validateEmail(user.email)) {
        return false;
      }
      state.users.push(user);
      return true;
    },

    setCurrentUser: (user: User | null): void => {
      state.currentUser = user;
    },

    findUser: (id: string): User | undefined => {
      return state.users.find((u) => u.id === id);
    },
  };
}

/**
 * Type for the user store instance.
 */
export type UserStore = ReturnType<typeof createUserStore>;
