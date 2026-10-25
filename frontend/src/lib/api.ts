// ==========================================
// FILE: frontend/src/lib/api.ts
// PURPOSE: Typed API client with automatic, tab-safe token refresh.
// ==========================================
import { session } from "./session";
import type { AuthResult, Page, PageMeta } from "./types";

// Empty in development (the Vite proxy handles /api). Set VITE_API_URL in production.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") || "/api/v1";

export class ApiRequestError extends Error {
  status: number; // 0 means the server could not be reached

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  meta?: PageMeta;
  message?: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean; // default true. Login, register and similar calls pass false.
  signal?: AbortSignal;
}

async function readBody<T>(res: Response): Promise<Envelope<T>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Envelope<T>;
  } catch {
    return {};
  }
}

function sendRequest(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
}

// ---------------------------------------------------------------- token refresh

// The refresh token is single-use on the server, and reusing an old one signs EVERY session out.
// So refreshing must never happen twice at once, neither inside this tab nor across tabs.
let refreshInFlight: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  // Read the token only now, after any lock was acquired: another tab may have rotated it while we waited.
  const refreshToken = session.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (res.ok) {
      const body = await readBody<AuthResult>(res);
      if (!body.data) return null;
      session.setTokens(body.data.accessToken, body.data.refreshToken);
      return body.data.accessToken;
    }

    // The server says this session is over.
    if (res.status === 401 || res.status === 403) session.clear();
    return null;
  } catch {
    return null; // offline: keep the session and try again later
  }
}

export function refreshSession(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      if (typeof navigator !== "undefined" && "locks" in navigator) {
        return await navigator.locks.request("tti-refresh", performRefresh); // serialises across tabs
      }
      return await performRefresh();
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// ---------------------------------------------------------------- requests

const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";

async function request<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
  const useAuth = options.auth !== false;

  let res: Response;
  try {
    res = await sendRequest(path, options, useAuth ? session.getAccessToken() : null);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiRequestError(0, NETWORK_MESSAGE);
  }

  // The access token expired: get a new one and try once more.
  if (res.status === 401 && useAuth && session.getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      try {
        res = await sendRequest(path, options, fresh);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        throw new ApiRequestError(0, NETWORK_MESSAGE);
      }
    }
  }

  const body = await readBody<T>(res);
  if (!res.ok) {
    throw new ApiRequestError(res.status, body.message || `Something went wrong (${res.status}). Please try again.`);
  }
  return body;
}

export const api = {
  async get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return (await request<T>(path, { ...options, method: "GET" })).data as T;
  },

  async post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return (await request<T>(path, { ...options, method: "POST", body })).data as T;
  },

  async patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return (await request<T>(path, { ...options, method: "PATCH", body })).data as T;
  },

  async delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return (await request<T>(path, { ...options, method: "DELETE" })).data as T;
  },

  // For paginated endpoints: returns the items together with { total, page, limit }.
  async list<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<Page<T>> {
    const res = await request<T[]>(path, { ...options, method: "GET" });
    return { items: res.data ?? [], meta: res.meta ?? { total: 0, page: 1, limit: 0 } };
  },
};

// A message that is safe to show to a person.
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message.replace(/^Validation failed\s*-\s*/i, "");
  }
  return "Something went wrong. Please try again.";
}
// ==========================================
// END OF FILE: frontend/src/lib/api.ts
// ==========================================
