// ==========================================
// FILE: frontend/src/pages/public/EventDetail.tsx
// PURPOSE: One event: details, organiser, save and share, ticket selection and similar events.
// ==========================================
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, CalendarX2, MapPin } from "lucide-react";
import EventCard from "../../components/EventCard";
import FollowButton from "../../components/FollowButton";
import HeartButton from "../../components/HeartButton";
import ShareButton from "../../components/ShareButton";
import TicketPicker from "../../components/TicketPicker";
import Alert from "../../components/ui/Alert";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import { ApiRequestError, api, errorMessage } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import { recordView } from "../../lib/recent";
import { useTitle } from "../../lib/useTitle";
import type { EventSummary } from "../../lib/types";

export default function EventDetail() {
  const { slug } = useParams<{ slug: string }>();

  const query = useQuery({
    queryKey: ["event", slug],
    queryFn: () => api.get<EventSummary>(`/events/${slug}`),
    enabled: Boolean(slug),
  });

  const similar = useQuery({
    queryKey: ["events", "similar", slug],
    queryFn: () => api.get<EventSummary[]>(`/events/${slug}/similar`),
    enabled: Boolean(slug) && query.isSuccess,
  });

  const event = query.data;
  useTitle(event?.title);

  // Remember it for "Recently viewed" on the home page.
  const viewed = event?.slug;
  useEffect(() => {
    if (viewed) recordView(viewed);
  }, [viewed]);

  if (query.isPending) return <PageSpinner />;

  if (query.isError || !event) {
    const notFound = query.error instanceof ApiRequestError && query.error.status === 404;
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {notFound ? (
          <EmptyState
            icon={<CalendarX2 className="size-6" aria-hidden="true" />}
            title="Event not found"
            text="It may have ended, or the link is wrong."
            action={
              <Link to="/events" className={buttonClasses("secondary")}>
                Back to events
              </Link>
            }
          />
        ) : (
          <Alert>{errorMessage(query.error)}</Alert>
        )}
      </div>
    );
  }

  const tickets = event.ticketTypes.filter((t) => t.isActive);
  const related = similar.data ?? [];

  return (
    <article className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link to="/events" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All events
      </Link>

      {/* banner */}
      <div className="relative mb-8 aspect-21/9 overflow-hidden rounded-2xl border border-line bg-panel-2">
        {event.bannerUrl ? (
          <img src={event.bannerUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_25%_25%,rgba(227,38,54,0.35),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(201,164,92,0.25),transparent_55%)]">
            <CalendarDays className="size-14 text-gold/70" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h1 className="text-3xl leading-tight font-extrabold text-fg sm:text-4xl">{event.title}</h1>

          {event.seller ? (
            <p className="mt-2 text-sm text-muted">
              By{" "}
              <Link to={`/organizers/${event.seller.id}`} className="font-semibold text-gold underline-offset-4 hover:underline">
                {event.seller.businessName}
              </Link>
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <HeartButton eventId={event.id} title={event.title} withLabel />
            <ShareButton title={event.title} path={`/events/${event.slug}`} />
            {event.seller ? <FollowButton sellerId={event.seller.id} name={event.seller.businessName} /> : null}
          </div>

          <h2 className="mt-8 mb-2 text-sm font-semibold tracking-widest text-gold uppercase">About this event</h2>
          <p className="text-base leading-relaxed whitespace-pre-line text-muted">{event.description}</p>

          <h2 className="mt-10 mb-4 text-sm font-semibold tracking-widest text-gold uppercase">Tickets</h2>
          {tickets.length === 0 ? (
            <Card className="p-6 text-sm text-muted">Tickets for this event are not on sale yet.</Card>
          ) : (
            <TicketPicker event={event} tickets={tickets} />
          )}
        </div>

        {/* details */}
        <aside>
          <Card className="space-y-5 p-6 lg:sticky lg:top-20">
            <div className="flex gap-3">
              <CalendarDays className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden="true" />
              <div>
                <p className="font-semibold text-fg">{formatDate(event.startsAt)}</p>
                <p className="text-sm text-muted">
                  {formatTime(event.startsAt)} to {formatTime(event.endsAt)} (Nairobi time)
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden="true" />
              <div>
                <p className="font-semibold text-fg">{event.venue}</p>
                <p className="text-sm text-muted">
                  {event.city}, {event.country}
                </p>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="mt-16" aria-label="Similar events">
          <h2 className="mb-6 text-2xl font-bold text-fg">More like this</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/EventDetail.tsx
// ==========================================