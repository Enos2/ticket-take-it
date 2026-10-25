// ==========================================
// FILE: frontend/src/pages/public/Home.tsx
// PURPOSE: Landing page: hero, the next few events and what makes the platform different.
// ==========================================
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, QrCode, ShieldCheck } from "lucide-react";
import EventGrid from "../../components/EventGrid";
import { buttonClasses } from "../../components/ui/styles";
import { api } from "../../lib/api";
import { useTitle } from "../../lib/useTitle";
import type { EventSummary } from "../../lib/types";

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: "Paid securely",
    text: "Pay by card or M-Pesa. Every payment is confirmed with the payment provider before your tickets are issued.",
  },
  {
    icon: QrCode,
    title: "Tickets on your phone",
    text: "Each ticket has its own QR code. Show it at the door and walk in.",
  },
  {
    icon: BadgeCheck,
    title: "No double bookings",
    text: "When the last ticket is gone, it is gone. Nobody pays for a ticket that does not exist.",
  },
];

export default function Home() {
  useTitle();

  const query = useQuery({
    queryKey: ["events", "preview"],
    queryFn: () => api.list<EventSummary>("/events?page=1&limit=6"),
  });

  const events = query.data?.items ?? [];
  const hasMore = (query.data?.meta.total ?? 0) > events.length;

  return (
    <>
      {/* hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(227,38,54,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(201,164,92,0.18),transparent_50%)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="mb-4 text-sm font-semibold tracking-[0.25em] text-gold uppercase">Live events across Kenya</p>
          <h1 className="max-w-3xl text-4xl leading-tight font-extrabold text-fg sm:text-6xl">
            Your World. <span className="text-brand">Your Moment.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Find what is happening near you and get your tickets in minutes, paid by card or M-Pesa.
          </p>
          <Link to="/events" className={`${buttonClasses("primary", "lg")} mt-8`}>
            Browse events
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* upcoming */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-fg sm:text-3xl">Happening soon</h2>
            <p className="mt-1 text-sm text-muted">The next events on the calendar.</p>
          </div>
          {hasMore ? (
            <Link to="/events" className="hidden items-center gap-1.5 text-sm font-semibold text-gold hover:underline sm:inline-flex">
              View all events
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        <EventGrid
          events={events}
          loading={query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
        />

        {hasMore ? (
          <div className="mt-10 flex justify-center sm:hidden">
            <Link to="/events" className={buttonClasses("secondary")}>
              View all events
            </Link>
          </div>
        ) : null}
      </section>

      {/* why */}
      <section className="border-t border-line bg-panel/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-line bg-panel text-gold">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-fg">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Home.tsx
// ==========================================