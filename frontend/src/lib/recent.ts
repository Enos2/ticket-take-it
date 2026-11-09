// ==========================================
// FILE: frontend/src/lib/recent.ts
// PURPOSE: Remembers the last events someone looked at. It stays on their own device.
// ==========================================
const KEY = "tti.recentEvents";
const MAX = 8;

export function readRecent(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is string => typeof s === "string" && /^[a-z0-9-]+$/.test(s)).slice(0, MAX);
  } catch {
    return []; // storage can be blocked, or hold something unexpected
  }
}

export function recordView(slug: string): void {
  try {
    const list = [slug, ...readRecent().filter((s) => s !== slug)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* not being able to remember is fine */
  }
}
// ==========================================
// END OF FILE: frontend/src/lib/recent.ts
// ==========================================