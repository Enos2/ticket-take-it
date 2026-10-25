// ==========================================
// FILE: frontend/src/lib/cx.ts
// PURPOSE: Joins class names, skipping empty values.
// ==========================================
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
// ==========================================
// END OF FILE: frontend/src/lib/cx.ts
// ==========================================
