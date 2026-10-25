// ==========================================
// FILE: frontend/src/lib/format.ts
// PURPOSE: Money and date formatting. Times are shown in Nairobi time.
// ==========================================
const TIME_ZONE = "Africa/Nairobi";

// Amounts are stored in cents.
export function formatMoney(cents: number, currency: string): string {
  if (cents === 0) return "Free";
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;
// ==========================================
// END OF FILE: frontend/src/lib/format.ts
// ==========================================
