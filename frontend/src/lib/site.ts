// ==========================================
// FILE: frontend/src/lib/site.ts
// PURPOSE: Company details used by the legal pages and the Help page.
// ==========================================
const clean = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const companyName = clean(import.meta.env.VITE_COMPANY_NAME);
const supportEmail = clean(import.meta.env.VITE_SUPPORT_EMAIL);

// What still has to be filled in before the site is ready for the public.
const missingSettings: string[] = [];
if (!companyName) missingSettings.push("VITE_COMPANY_NAME");
if (!supportEmail) missingSettings.push("VITE_SUPPORT_EMAIL");

export const SITE = {
  name: "Ticket Take It",
  companyName: companyName ?? "Ticket Take It",
  supportEmail,
  legalReviewed: import.meta.env.VITE_LEGAL_REVIEWED === "true",
  legalUpdated: "7 November 2026",
  holdMinutes: 15, // how long unpaid tickets are held
  missingSettings,
};
// ==========================================
// END OF FILE: frontend/src/lib/site.ts
// ==========================================