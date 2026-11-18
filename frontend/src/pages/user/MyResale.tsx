// ==========================================
// FILE: frontend/src/pages/user/MyResale.tsx
// PURPOSE: Tickets the signed-in person put up for resale: what is for sale, what sold and what they will receive.
// ==========================================
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, formatMoney } from "../../lib/format";
import { useTitle } from "../../lib/useTitle";
import { LISTING_STATUS_LABEL } from "../../lib/resale";
import type { MyListing, MyResale, ResaleListingStatus } from "../../lib/resale";

const TONE: Record<ResaleListingStatus, "neutral" | "gold" | "brand" | "ok"> = {
  ACTIVE: "gold",
  RESERVED: "gold",
  SOLD: "ok",
  CANCELLED: "neutral",
};

function Row({ listing, onCancel, cancelling }: { listing: MyListing; onCancel: (id: string) => void; cancelling: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-fg">
            <Link to={`/events/${listing.ticket.event.slug}`} className="hover:text-gold">
              {listing.ticket.event.title}
            </Link>
          </h3>
          <p className="text-sm font-medium text-gold">{listing.ticket.ticketType.name}</p>
        </div>
        <Badge tone={TONE[listing.status]}>{LISTING_STATUS_LABEL[listing.status]}</Badge>
      </div>

      <p className="mt-3 text-sm text-muted">
        Asking price <span className="font-semibold text-fg">{formatMoney(listing.priceCents, listing.currency)}</span>
      </p>

      {listing.status === "SOLD" && listing.netCents !== null ? (
        <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <p className="text-muted">
            Sold {listing.soldAt ? formatDateTime(listing.soldAt) : ""} · commission {formatMoney(listing.feeCents ?? 0, listing.currency)}
          </p>
          <p className="text-fg">
            You receive <span className="font-bold">{formatMoney(listing.netCents, listing.currency)}</span>
          </p>
          <p className="text-xs text-muted">
            {listing.payoutStatus === "PAID"
              ? `Sent to ${listing.payoutPhone}.`
              : `We will send it to ${listing.payoutPhone}, usually within a few days.`}
          </p>
        </div>
      ) : null}

      {listing.status === "ACTIVE" ? (
        <div className="mt-3">
          <Button size="sm" variant="ghost" loading={cancelling} onClick={() => onCancel(listing.id)}>
            Cancel listing
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export default function MyResale() {
  useTitle("My resale");

  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["resale-mine"],
    queryFn: () => api.get<MyResale>("/resale/mine"),
  });

  const cancel = useMutation({
    mutationFn: (listingId: string) => api.delete(`/resale/listings/${listingId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resale-mine"] });
      void queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
      setError(null);
    },
    onError: (err) => {
      void queryClient.invalidateQueries({ queryKey: ["resale-mine"] });
      setError(errorMessage(err));
    },
  });

  if (query.isPending) return <PageSpinner />;

  if (query.isError) {
    return (
      <div className="space-y-4">
        <Alert>{errorMessage(query.error)}</Alert>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const { listings } = query.data;

  if (listings.length === 0) {
    return (
      <EmptyState
        icon={<Store className="size-6" aria-hidden="true" />}
        title="You are not selling any tickets"
        text="If an organiser allows resale, you will see a Sell button under your tickets. The price is capped by the organiser, and the ticket gets a new QR code for the buyer."
        action={
          <Link to="/account/tickets" className="font-semibold text-gold underline-offset-4 hover:underline">
            Go to My tickets
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <ul className="space-y-3">
        {listings.map((listing) => (
          <li key={listing.id}>
            <Row listing={listing} onCancel={(id) => cancel.mutate(id)} cancelling={cancel.isPending && cancel.variables === listing.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/MyResale.tsx
// ==========================================