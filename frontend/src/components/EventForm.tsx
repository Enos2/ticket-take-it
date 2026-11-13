// ==========================================
// FILE: frontend/src/components/EventForm.tsx
// PURPOSE: The form for creating an event and for editing its details.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { inputToTime, nairobiInputToIso, nowNairobiInput } from "../lib/datetime";
import { EMPTY_EVENT_VALUES } from "../lib/eventForm";
import { CATEGORY_OPTIONS } from "../lib/categories";
import type { EventFormValues, EventPayload } from "../lib/eventForm";
import Alert from "./ui/Alert";
import Button from "./ui/Button";
import { Field, SelectField, TextAreaField } from "./ui/Field";

type Errors = Partial<Record<keyof EventFormValues, string>>;

const length = (text: string) => text.trim().length;

const MAX_CAPACITY = 1_000_000;

function validate(values: EventFormValues, initial: EventFormValues | null): Errors {
  const errors: Errors = {};

  if (length(values.title) < 3 || length(values.title) > 100) errors.title = "Use 3 to 100 characters";
  if (length(values.description) < 10) errors.description = "Describe the event in at least 10 characters";
  else if (length(values.description) > 5000) errors.description = "Keep it under 5000 characters";
  if (length(values.venue) < 3 || length(values.venue) > 200) errors.venue = "Enter the venue name";
  if (length(values.city) < 2 || length(values.city) > 100) errors.city = "Enter the city";
  if (length(values.country) < 2 || length(values.country) > 100) errors.country = "Enter the country";

  // An event that already started can still be edited, as long as its start time isn't touched.
  const startChanged = !initial || values.startsAt !== initial.startsAt;
  if (!values.startsAt) errors.startsAt = "Choose when it starts";
  else if (startChanged && inputToTime(values.startsAt) <= Date.now()) errors.startsAt = "The start must be in the future";

  if (!values.endsAt) errors.endsAt = "Choose when it ends";
  else if (values.startsAt && inputToTime(values.endsAt) <= inputToTime(values.startsAt)) {
    errors.endsAt = "The end must be after the start";
  }

  const banner = values.bannerUrl.trim();
  if (banner) {
    try {
      if (new URL(banner).protocol !== "https:") errors.bannerUrl = "Use a link that starts with https://";
      else if (banner.length > 500) errors.bannerUrl = "That link is too long";
    } catch {
      errors.bannerUrl = "Enter a full link, starting with https://";
    }
  }

  // The server also checks that the capacity is not below what is already sold, held or kept for guests.
  const capacity = values.maxCapacity.trim();
  if (capacity && (!/^\d+$/.test(capacity) || Number(capacity) < 1 || Number(capacity) > MAX_CAPACITY)) {
    errors.maxCapacity = "Enter a whole number from 1 to 1,000,000, or leave it empty";
  }

  return errors;
}

function buildPayload(values: EventFormValues, initial: EventFormValues | null): EventPayload {
  const changed = (key: keyof EventFormValues) => !initial || values[key].trim() !== initial[key].trim();
  const payload: EventPayload = {};

  if (changed("title")) payload.title = values.title.trim();
  if (changed("description")) payload.description = values.description.trim();
  if (changed("venue")) payload.venue = values.venue.trim();
  if (changed("city")) payload.city = values.city.trim();
  if (changed("country")) payload.country = values.country.trim();
  if (changed("category")) payload.category = values.category;
  if (changed("startsAt")) payload.startsAt = nairobiInputToIso(values.startsAt);
  if (changed("endsAt")) payload.endsAt = nairobiInputToIso(values.endsAt);

  if (changed("bannerUrl")) {
    const banner = values.bannerUrl.trim();
    if (banner) payload.bannerUrl = banner;
    else if (initial) payload.bannerUrl = null; // the banner was removed
  }

  if (changed("maxCapacity")) {
    const capacity = values.maxCapacity.trim();
    if (capacity) payload.maxCapacity = Number(capacity);
    else if (initial) payload.maxCapacity = null; // the limit was removed
  }

  return payload;
}

interface EventFormProps {
  initial?: EventFormValues; // leave out to create a new event
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: EventPayload) => void;
}

export default function EventForm({ initial, submitLabel, busy, error, onSubmit }: EventFormProps) {
  const [values, setValues] = useState<EventFormValues>(initial ?? EMPTY_EVENT_VALUES);
  const [showErrors, setShowErrors] = useState(false);

  const errors = validate(values, initial ?? null);
  const payload = buildPayload(values, initial ?? null);
  const dirty = !initial || Object.keys(payload).length > 0;
  const shown = (key: keyof EventFormValues) => (showErrors ? errors[key] : undefined);

  const set = (key: keyof EventFormValues) => (value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  const minStart = nowNairobiInput();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? <Alert>{error}</Alert> : null}
      {showErrors && Object.keys(errors).length > 0 ? <Alert>Please fix the highlighted fields.</Alert> : null}

      <Field
        label="Event title"
        value={values.title}
        onChange={(e) => set("title")(e.target.value)}
        error={shown("title")}
        maxLength={100}
        autoFocus={!initial}
      />

      <TextAreaField
        label="Description"
        value={values.description}
        onChange={(e) => set("description")(e.target.value)}
        error={shown("description")}
        hint="What is it, who is it for, what should people bring? Line breaks are kept."
        rows={6}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Starts (Nairobi time)"
          type="datetime-local"
          min={initial ? undefined : minStart}
          value={values.startsAt}
          onChange={(e) => set("startsAt")(e.target.value)}
          error={shown("startsAt")}
        />
        <Field
          label="Ends (Nairobi time)"
          type="datetime-local"
          min={values.startsAt || undefined}
          value={values.endsAt}
          onChange={(e) => set("endsAt")(e.target.value)}
          error={shown("endsAt")}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Venue" value={values.venue} onChange={(e) => set("venue")(e.target.value)} error={shown("venue")} />
        <Field label="City" value={values.city} onChange={(e) => set("city")(e.target.value)} error={shown("city")} />
      </div>

      <Field label="Country" value={values.country} onChange={(e) => set("country")(e.target.value)} error={shown("country")} />
      <SelectField label="Category" value={values.category} onChange={(e) => set("category")(e.target.value)} hint="Helps people find your event.">
        {CATEGORY_OPTIONS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </SelectField>

      <Field
        label="Event capacity (optional)"
        inputMode="numeric"
        placeholder="500"
        value={values.maxCapacity}
        onChange={(e) => set("maxCapacity")(e.target.value)}
        error={shown("maxCapacity")}
        hint="The most people the event can hold, across all ticket types. When this many tickets are sold, held or kept for guests, the event shows as sold out. Leave it empty to use only your ticket quantities."
      />

      <Field
        label="Banner image link (optional)"
        type="url"
        placeholder="https://"
        value={values.bannerUrl}
        onChange={(e) => set("bannerUrl")(e.target.value)}
        error={shown("bannerUrl")}
        hint="A wide image works best. Image uploads are coming later."
      />

      <Button type="submit" size="lg" loading={busy} disabled={!dirty}>
        {submitLabel}
      </Button>
    </form>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/EventForm.tsx
// ==========================================