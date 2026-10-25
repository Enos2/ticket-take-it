// ==========================================
// FILE: frontend/src/lib/session.ts
// PURPOSE: Holds the login tokens. The access token stays in memory only. The refresh token is saved in the browser.
// ==========================================
const REFRESH_KEY = "tti.refreshToken";

let accessToken: string | null = null;
const listeners = new Set<() => void>();

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null; // storage can be blocked (private mode, strict settings)
  }
}

function notifyCleared() {
  listeners.forEach((listener) => listener());
}

export const session = {
  getAccessToken: (): string | null => accessToken,
  getRefreshToken: readRefreshToken,

  setTokens(access: string, refresh: string) {
    accessToken = access;
    try {
      localStorage.setItem(REFRESH_KEY, refresh);
    } catch {
      /* the user stays signed in until the page is closed */
    }
  },

  // Signs out locally and tells everything that is listening.
  clear() {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* nothing to remove */
    }
    notifyCleared();
  },

  onCleared(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

// Signing out in one tab signs out the others.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === REFRESH_KEY && event.newValue === null) {
      accessToken = null;
      notifyCleared();
    }
  });
}
// ==========================================
// END OF FILE: frontend/src/lib/session.ts
// ==========================================
