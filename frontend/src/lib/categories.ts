// ==========================================
// FILE: frontend/src/lib/categories.ts
// PURPOSE: Event categories and their names.
// ==========================================
import type { EventCategory } from "./types";

export const CATEGORY_OPTIONS: { value: EventCategory; label: string }[] = [
  { value: "MUSIC", label: "Music" },
  { value: "NIGHTLIFE", label: "Nightlife" },
  { value: "ARTS", label: "Arts and theatre" },
  { value: "SPORTS", label: "Sports and fitness" },
  { value: "CONFERENCE", label: "Conferences and business" },
  { value: "FOOD", label: "Food and drink" },
  { value: "FAMILY", label: "Family and kids" },
  { value: "COMMUNITY", label: "Community and charity" },
  { value: "OTHER", label: "Other" },
];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));
// ==========================================
// END OF FILE: frontend/src/lib/categories.ts
// ==========================================