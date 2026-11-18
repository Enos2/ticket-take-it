// ==========================================
// FILE: frontend/src/components/ResaleListings.tsx
// PURPOSE: Tickets other fans are reselling for an event, on the event page. Buying goes through the normal checkout.
// ==========================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/authStore";
import { TIER_LABEL } from "../lib/events";
import { formatMoney } from "../lib/format";
import { seatLabel } from "../lib/seating";
import type { BoughtListing, EventResale } from "../lib/resale";
import type { EventSummary } from "../lib/types";
import Alert from "./ui/Alert";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Card from "./ui/Card";

export default function ResaleListings({ event }: { event: EventSummary }) {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["resale", event.id],
    queryFn: () => api.get<EventResale>(`/resale/events/${event.id}`),
    refetchInterval: 60_000, // pauses while the tab is in the background
  });

  const buy = useMutation({
    mutationFn: (listingId: string) => api.post<BoughtListing>(`/resale/listings/${listingId}/buy`),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ["resale", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      navigate(`/checkout/${order.id}`);
    },
    onError: (err) => {
      setError(errorMessage(err));
      // Someone else may have just taken it. Show what is really left.
      void queryClient.invalidateQueries({ queryKey: ["resale", event.id] });
    },
  });

  function handleBuy(listingId: string) {
    setError(null);
    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    buy.mutate(listingId);
  }

  // Nothing to show: resale is off, or nobody is selling.
  if (!query.data || !query.data.enabled || query.data.listings.length === 0) return null;

  const { listings } = query.data;

  return (
    <section className="mt-10" aria-label="Resale tickets">
      <h2 className="mb-1 text-sm font-semibold tracking-widest text-gold uppercase">Resale tickets</h2>
      <p className="mb-4 text-sm text-muted">
        Tickets from other fans who can't make it. The organiser caps the price, and your ticket gets a new QR code the moment you pay.
      </p>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <ul className="space-y-3">
        {listings.map((listing) => (
          <li key={listing.id}>
            <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-fg">{listing.ticketType.name}</h3>
                  <Badge tone={listing.ticketType.tier === "VIP" ? "gold" : "neutral"}>{TIER_LABEL[listing.ticketType.tier]}</Badge>
                </div>
                {listing.seat ? <p className="mt-1 text-sm text-fg">{seatLabel(listing.seat)}</p> : null}
                <p className="mt-1 text-xs text-muted">Original price {formatMoney(listing.faceValueCents, listing.currency)}</p>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-5 sm:flex-col sm:items-end sm:gap-2">
                <span className="text-lg font-bold text-fg">{formatMoney(listing.priceCents, listing.currency)}</span>
                <Button size="sm" loading={buy.isPending && buy.variables === listing.id} onClick={() => handleBuy(listing.id)}>
                  {user ? "Buy this ticket" : "Sign in to buy"}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ResaleListings.tsx
// ==========================================