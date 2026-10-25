// ==========================================
// FILE: frontend/src/lib/authStore.ts
// PURPOSE: Who is signed in. The single source of truth for login state.
// ==========================================
import { create } from "zustand";
import { api, refreshSession } from "./api";
import { queryClient } from "./queryClient";
import { session } from "./session";
import type { AuthResult, User } from "./types";

type Status = "loading" | "authenticated" | "anonymous";

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

interface AuthState {
  user: User | null;
  status: Status;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: "loading",

  // Runs once when the app opens: restores the session from the saved refresh token, if there is one.
  init() {
    initPromise ??= (async () => {
      if (!session.getRefreshToken()) {
        set({ user: null, status: "anonymous" });
        return;
      }

      const token = await refreshSession();
      if (!token) {
        set({ user: null, status: "anonymous" });
        return;
      }

      try {
        const user = await api.get<User>("/users/me");
        set({ user, status: "authenticated" });
      } catch {
        set({ user: null, status: "anonymous" });
      }
    })();
    return initPromise;
  },

  async login(email, password) {
    const result = await api.post<AuthResult>("/auth/login", { email, password }, { auth: false });
    session.setTokens(result.accessToken, result.refreshToken);
    const user = await api.get<User>("/users/me");
    set({ user, status: "authenticated" });
  },

  async register(input) {
    const result = await api.post<AuthResult>("/auth/register", input, { auth: false });
    session.setTokens(result.accessToken, result.refreshToken);
    const user = await api.get<User>("/users/me");
    set({ user, status: "authenticated" });
  },

  async logout() {
    const refreshToken = session.getRefreshToken();
    if (refreshToken) {
      try {
        await api.post("/auth/logout", { refreshToken }, { auth: false });
      } catch {
        /* the session is cleared on this device either way */
      }
    }
    session.clear();
  },

  // Call after something changes about the account, such as verifying the email.
  async reloadUser() {
    try {
      const user = await api.get<User>("/users/me");
      set({ user });
    } catch {
      /* keep what we have */
    }
  },
}));

// Whenever the session ends (logout, expired, signed out in another tab), reset everything.
session.onCleared(() => {
  useAuth.setState({ user: null, status: "anonymous" });
  queryClient.clear();
});
// ==========================================
// END OF FILE: frontend/src/lib/authStore.ts
// ==========================================