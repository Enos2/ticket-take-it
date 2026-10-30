// ==========================================
// FILE: frontend/src/components/EventCard.tsx
// PURPOSE: One event in the events grid.
// ==========================================
import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { eventPricing } from "../lib/events";
import { formatDateTime } from "../lib/format";
import type { EventSummary } from "../lib/types";
import Badge from "./ui/Badge";
import { CATEGORY_LABEL } from "../lib/categories";

export default function EventCard({ event }: { event: EventSummary }) {
  const pricing = eventPricing(event);

  return (
    <Link
      to={`/events/${event.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-gold/60"
    >
      <div className="relative aspect-video overflow-hidden bg-panel-2">
        {event.bannerUrl ? (
          <img
            src={event.bannerUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(227,38,54,0.35),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(201,164,92,0.25),transparent_55%)]">
            <CalendarDays className="size-10 text-gold/70" aria-hidden="true" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <Badge tone={pricing.soldOut ? "brand" : "gold"}>{pricing.label}</Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="mb-1 text-xs font-semibold tracking-widest text-gold uppercase">{CATEGORY_LABEL[event.category] ?? event.category}</p>
        <h3 className="line-clamp-2 text-lg leading-snug font-bold text-fg">{event.title}</h3>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
            <span>{formatDateTime(event.startsAt)}</span>
          </li>
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
            <span className="line-clamp-1">
              {event.venue}, {event.city}
            </span>
          </li>
        </ul>
      </div>
    </Link>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/EventCard.tsx
// ==========================================
