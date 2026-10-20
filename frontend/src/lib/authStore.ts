// ==========================================
// FILE: frontend/src/lib/authStore.ts
// PURPOSE: Global state for authentication.
// ==========================================
import { create } from "zustand";

interface User {
  id: string;
  email: string;
  role: "USER" | "SELLER" | "ADMIN";
}

interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem("accessToken"),
  login: (user, token) => {
    localStorage.setItem("accessToken", token);
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem("accessToken");
    set({ user: null, token: null });
  },
}));
// ==========================================
// END OF FILE: frontend/src/lib/authStore.ts
// LOCATION: frontend/src/lib/authStore.ts
// LAST UPDATED: October 19, 2026
// ==========================================