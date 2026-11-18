// ==========================================
// FILE: frontend/src/components/ResaleControls.tsx
// PURPOSE: Under a ticket: put it up for resale at a capped price, or see and cancel a listing.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { formatMoney } from "../lib/format";
import { centsToInput, parseMoneyToCents } from "../lib/seller";
import type { CreateListingPayload, MyListing, ResaleOption } from "../lib/resale";
import Alert from "./ui/Alert";
import Button from "./ui/Button";
import { Field } from "./ui/Field";

interface ResaleControlsProps {
  ticketId: string;
  listing: MyListing | undefined; // an open listing of this ticket
  option: ResaleOption | undefined; // present when the ticket can be listed
}

export default function ResaleControls({ ticketId, listing, option }: ResaleControlsProps) {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [phone, setPhone] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["resale-mine"] });
    void queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
  }

  const create = useMutation({
    mutationFn: (payload: CreateListingPayload) => api.post<MyListing>("/resale/listings", payload),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setShowErrors(false);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const cancel = useMutation({
    mutationFn: (listingId: string) => api.delete(`/resale/listings/${listingId}`),
    onSuccess: () => {
      refresh();
      setError(null);
    },
    onError: (err) => {
      refresh();
      setError(errorMessage(err));
    },
  });

  // ---- already listed ----
  if (listing) {
    return (
      <div className="space-y-3">
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {listing.status === "RESERVED" ? (
              <>A buyer is paying {formatMoney(listing.priceCents, listing.currency)} for this ticket right now.</>
            ) : (
              <>
                For sale at <span className="font-semibold text-fg">{formatMoney(listing.priceCents, listing.currency)}</span>. You keep the ticket until it
                sells.
              </>
            )}
          </p>
          {listing.status === "ACTIVE" ? (
            <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(listing.id)}>
              Cancel listing
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!option) return null;

  // ---- not listed yet ----
  const priceCents = parseMoneyToCents(price);
  let priceError: string | undefined;
  if (priceCents === null || priceCents < 100) priceError = "Enter an amount, for example 1500";
  else if (priceCents > option.maxPriceCents) priceError = `The highest price allowed is ${formatMoney(option.maxPriceCents, option.currency)}`;
  else if (option.currency === "KES" && priceCents % 100 !== 0) priceError = "Use whole shillings, without cents";

  const phoneClean = phone.replace(/[\s-]/g, "");
  const phoneError = /^\+?\d{9,15}$/.test(phoneClean) ? undefined : "Enter your M-Pesa phone number";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (priceError || phoneError || priceCents === null) {
      setShowErrors(true);
      return;
    }
    setError(null);
    create.mutate({ ticketId, priceCents, payoutPhone: phoneClean });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Can't go? Sell this ticket to another fan, for up to {formatMoney(option.maxPriceCents, option.currency)}.</p>
        <Button
          size="sm"
          variant="secondary"
          icon={<Store className="size-4" aria-hidden="true" />}
          onClick={() => {
            setPrice(centsToInput(option.maxPriceCents));
            setOpen(true);
          }}
        >
          Sell
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error ? <Alert>{error}</Alert> : null}

      <Field
        label={`Asking price (${option.currency})`}
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        error={showErrors ? priceError : undefined}
        hint={`The organiser allows up to ${formatMoney(option.maxPriceCents, option.currency)} (the ticket cost ${formatMoney(option.faceValueCents, option.currency)}).`}
        autoFocus
      />

      <Field
        label="M-Pesa number for your money"
        inputMode="tel"
        placeholder="0712 345 678"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={showErrors ? phoneError : undefined}
        hint="When your ticket sells, Ticket Take It keeps a small commission and sends you the rest."
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" loading={create.isPending}>
          Put on sale
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={create.isPending}
          onClick={() => {
            setOpen(false);
            setShowErrors(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ResaleControls.tsx
// ==========================================