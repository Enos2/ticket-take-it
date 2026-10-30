// ==========================================
// FILE: frontend/src/components/seller/TicketTypeForm.tsx
// PURPOSE: The form for adding a ticket type and for editing one.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { inputToTime, isoToNairobiInput, nairobiInputToIso } from "../../lib/datetime";
import { TIER_LABEL } from "../../lib/events";
import { TIER_HELP, centsToInput, parseMoneyToCents } from "../../lib/seller";
import type { TicketPayload } from "../../lib/seller";
import type { TicketTier, TicketType } from "../../lib/types";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Card from "../ui/Card";
import { Field, SelectField, TextAreaField } from "../ui/Field";

interface Values {
  name: string;
  description: string;
  tier: TicketTier;
  price: string;
  quantity: string;
  earlyStart: string;
  earlyEnd: string;
  minGroup: string;
  maxGroup: string;
}

type Errors = Partial<Record<keyof Values, string>>;

const TIERS: TicketTier[] = ["REGULAR", "EARLY_BIRD", "VIP", "VVIP", "GROUP"];

function initialValues(ticket: TicketType | null): Values {
  if (!ticket) {
    return { name: "", description: "", tier: "REGULAR", price: "", quantity: "", earlyStart: "", earlyEnd: "", minGroup: "", maxGroup: "" };
  }
  return {
    name: ticket.name,
    description: ticket.description ?? "",
    tier: ticket.tier,
    price: centsToInput(ticket.priceCents),
    quantity: String(ticket.quantity),
    earlyStart: ticket.startsAt ? isoToNairobiInput(ticket.startsAt) : "",
    earlyEnd: ticket.endsAt ? isoToNairobiInput(ticket.endsAt) : "",
    minGroup: ticket.minGroupSize ? String(ticket.minGroupSize) : "",
    maxGroup: ticket.maxGroupSize ? String(ticket.maxGroupSize) : "",
  };
}

interface TicketTypeFormProps {
  ticket: TicketType | null; // null means adding a new one
  currency: string;
  eventEndsAt: string;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: TicketPayload) => void;
  onCancel: () => void;
}

export default function TicketTypeForm({ ticket, currency, eventEndsAt, busy, error, onSubmit, onCancel }: TicketTypeFormProps) {
  const initial = initialValues(ticket);
  const [values, setValues] = useState<Values>(initial);
  const [showErrors, setShowErrors] = useState(false);

  const editing = ticket !== null;
  const tier = editing ? ticket.tier : values.tier;
  const showEarly = tier === "EARLY_BIRD";
  const showGroup = editing ? ticket.isGroup : tier === "GROUP";
  const set = (key: keyof Values) => (value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  // ---- validation ----
  const errors: Errors = {};
  const priceCents = parseMoneyToCents(values.price);
  const quantity = /^\d+$/.test(values.quantity) ? Number(values.quantity) : NaN;

  if (values.name.trim().length < 2 || values.name.trim().length > 100) errors.name = "Use 2 to 100 characters";

  if (priceCents === null) errors.price = "Enter an amount such as 1500, or 0 for a free ticket";
  else if (priceCents > 100_000_000) errors.price = "That price is too high";
  else if (currency === "KES" && priceCents % 100 !== 0) errors.price = "Use whole shillings, without cents";

  if (!Number.isInteger(quantity) || quantity < 1) errors.quantity = "Enter how many tickets are available";
  else if (quantity > 100_000) errors.quantity = "The most is 100,000";
  else if (ticket && quantity < ticket.sold) errors.quantity = `At least ${ticket.sold}, because that many are sold or held`;

  if (showEarly) {
    if (!values.earlyStart) errors.earlyStart = "Choose when this price starts";
    if (!values.earlyEnd) errors.earlyEnd = "Choose when this price ends";
    else if (values.earlyStart && inputToTime(values.earlyEnd) <= inputToTime(values.earlyStart)) errors.earlyEnd = "Must be after the start";
    else if (inputToTime(values.earlyEnd) > new Date(eventEndsAt).getTime()) errors.earlyEnd = "Must end before the event ends";
  }

  if (showGroup) {
    const min = /^\d+$/.test(values.minGroup) ? Number(values.minGroup) : NaN;
    const max = /^\d+$/.test(values.maxGroup) ? Number(values.maxGroup) : NaN;
    if (!Number.isInteger(min) || min < 2) errors.minGroup = "At least 2";
    if (!Number.isInteger(max) || max < 2) errors.maxGroup = "At least 2";
    else if (!errors.minGroup && max < min) errors.maxGroup = "Not smaller than the minimum";
    else if (Number.isInteger(quantity) && max > quantity) errors.maxGroup = "Not more than the total tickets";
  }

  // ---- what to send ----
  const payload: TicketPayload = {};
  if (!editing) {
    payload.name = values.name.trim();
    payload.tier = values.tier;
    payload.priceCents = priceCents ?? 0;
    payload.currency = currency;
    payload.quantity = quantity;
    if (values.description.trim()) payload.description = values.description.trim();
    if (showEarly && values.earlyStart && values.earlyEnd) {
      payload.startsAt = nairobiInputToIso(values.earlyStart);
      payload.endsAt = nairobiInputToIso(values.earlyEnd);
    }
    if (showGroup) {
      payload.minGroupSize = Number(values.minGroup);
      payload.maxGroupSize = Number(values.maxGroup);
    }
  } else {
    if (values.name.trim() !== initial.name) payload.name = values.name.trim();
    if (values.description.trim() !== initial.description.trim()) payload.description = values.description.trim() || null;
    if (priceCents !== null && values.price !== initial.price) payload.priceCents = priceCents;
    if (Number.isInteger(quantity) && values.quantity !== initial.quantity) payload.quantity = quantity;
    if (showEarly && values.earlyStart !== initial.earlyStart && values.earlyStart) payload.startsAt = nairobiInputToIso(values.earlyStart);
    if (showEarly && values.earlyEnd !== initial.earlyEnd && values.earlyEnd) payload.endsAt = nairobiInputToIso(values.earlyEnd);
    if (showGroup && values.minGroup !== initial.minGroup) payload.minGroupSize = Number(values.minGroup);
    if (showGroup && values.maxGroup !== initial.maxGroup) payload.maxGroupSize = Number(values.maxGroup);
  }

  const dirty = !editing || Object.keys(payload).length > 0;
  const shown = (key: keyof Values) => (showErrors ? errors[key] : undefined);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    onSubmit(payload);
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold text-fg">{editing ? `Edit ${ticket.name}` : "Add a ticket type"}</h3>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5" noValidate>
        {error ? <Alert>{error}</Alert> : null}

        <Field
          label="Name"
          placeholder="General admission"
          value={values.name}
          onChange={(e) => set("name")(e.target.value)}
          error={shown("name")}
          autoFocus
        />

        {editing ? (
          <p className="text-sm text-muted">
            Type: <span className="font-semibold text-fg">{TIER_LABEL[ticket.tier]}</span>. The type and currency can't change after
            tickets are created. Delete the ticket type and add a new one if you need to.
          </p>
        ) : (
          <SelectField
            label="Type"
            value={values.tier}
            onChange={(e) => set("tier")(e.target.value)}
            hint={TIER_HELP[values.tier]}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </SelectField>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={`Price (${currency})`}
            inputMode="decimal"
            placeholder="1500"
            value={values.price}
            onChange={(e) => set("price")(e.target.value)}
            error={shown("price")}
            hint={editing ? "A new price only applies to future orders." : "Enter 0 for a free ticket."}
          />
          <Field
            label="Number of tickets"
            inputMode="numeric"
            placeholder="100"
            value={values.quantity}
            onChange={(e) => set("quantity")(e.target.value)}
            error={shown("quantity")}
            hint={ticket && ticket.sold > 0 ? `${ticket.sold} are already sold or held.` : undefined}
          />
        </div>

        {showEarly ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Early bird starts (Nairobi time)"
              type="datetime-local"
              value={values.earlyStart}
              onChange={(e) => set("earlyStart")(e.target.value)}
              error={shown("earlyStart")}
            />
            <Field
              label="Early bird ends (Nairobi time)"
              type="datetime-local"
              value={values.earlyEnd}
              onChange={(e) => set("earlyEnd")(e.target.value)}
              error={shown("earlyEnd")}
            />
          </div>
        ) : null}

        {showGroup ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Smallest group"
              inputMode="numeric"
              placeholder="4"
              value={values.minGroup}
              onChange={(e) => set("minGroup")(e.target.value)}
              error={shown("minGroup")}
            />
            <Field
              label="Largest group"
              inputMode="numeric"
              placeholder="8"
              value={values.maxGroup}
              onChange={(e) => set("maxGroup")(e.target.value)}
              error={shown("maxGroup")}
            />
          </div>
        ) : null}

        <TextAreaField
          label="Description (optional)"
          rows={3}
          value={values.description}
          onChange={(e) => set("description")(e.target.value)}
          hint="Shown under the ticket name, for example what is included."
        />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={busy} disabled={!dirty}>
            {editing ? "Save changes" : "Add ticket type"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/seller/TicketTypeForm.tsx
// ==========================================