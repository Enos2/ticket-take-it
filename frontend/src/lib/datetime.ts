// ==========================================
// FILE: frontend/src/lib/datetime.ts
// PURPOSE: Converts between what a seller types (Nairobi time) and what the API expects.
// ==========================================
// Nairobi has no daylight saving, so it is always UTC+3.
const NAIROBI_TIME_ZONE = "Africa/Nairobi";

const inputFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: NAIROBI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// "2026-11-05T15:00:00.000Z" becomes "2026-11-05T18:00", the format a datetime-local input uses.
export function isoToNairobiInput(iso: string): string {
  const parts: Record<string, string> = {};
  for (const part of inputFormat.formatToParts(new Date(iso))) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// "2026-11-05T18:00" typed as Nairobi time becomes "2026-11-05T18:00:00+03:00".
export function nairobiInputToIso(value: string): string {
  const withSeconds = /T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  return `${withSeconds}+03:00`;
}

export const inputToTime = (value: string): number => new Date(nairobiInputToIso(value)).getTime();

export const nowNairobiInput = (): string => isoToNairobiInput(new Date().toISOString());
// ==========================================
// END OF FILE: frontend/src/lib/datetime.ts
// ==========================================