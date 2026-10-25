// ==========================================
// FILE: frontend/src/lib/eventForm.ts
// PURPOSE: The values and payload of the event form, shared by the create and edit screens.
// ==========================================
import { isoToNairobiInput } from "./datetime";
import type { SellerEvent } from "./types";

// Everything is text while the person types.
export interface EventFormValues {
  title: string;
  description: string;
  venue: string;
  city: string;
  country: string;
  startsAt: string; // Nairobi time, as a datetime-local value
  endsAt: string;
  bannerUrl: string;
}

// What is sent to the API. When editing, only the fields that changed.
export interface EventPayload {
  title?: string;
  description?: string;
  venue?: string;
  city?: string;
  country?: string;
  startsAt?: string;
  endsAt?: string;
  bannerUrl?: string | null; // null removes the banner
}

export const EMPTY_EVENT_VALUES: EventFormValues = {
  title: "",
  description: "",
  venue: "",
  city: "",
  country: "Kenya",
  startsAt: "",
  endsAt: "",
  bannerUrl: "",
};

export function eventToFormValues(event: SellerEvent): EventFormValues {
  return {
    title: event.title,
    description: event.description,
    venue: event.venue,
    city: event.city,
    country: event.country,
    startsAt: isoToNairobiInput(event.startsAt),
    endsAt: isoToNairobiInput(event.endsAt),
    bannerUrl: event.bannerUrl ?? "",
  };
}
// ==========================================
// END OF FILE: frontend/src/lib/eventForm.ts
// ==========================================