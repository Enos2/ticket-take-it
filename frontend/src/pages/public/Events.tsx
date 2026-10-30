// ==========================================
// FILE: frontend/src/pages/public/Events.tsx
// PURPOSE: Every upcoming event, with search, filters and sorting. The filters live in the page address, so links can be shared.
// ==========================================
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { SearchX, SlidersHorizontal, X } from "lucide-react";
import EventGrid from "../../components/EventGrid";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { Field, SelectField } from "../../components/ui/Field";
import SearchInput from "../../components/ui/SearchInput";
import { CATEGORY_LABEL } from "../../lib/categories";
import { api } from "../../lib/api";
import { cx } from "../../lib/cx";
import { formatDate } from "../../lib/format";
import { useDebouncedValue } from "../../lib/useDebounce";
import { useTitle } from "../../lib/useTitle";
import type { EventFilterOptions, EventSummary } from "../../lib/types";

const PAGE_SIZE = 12;

const SORTS = [
  { value: "soonest", label: "Soonest first" },
  { value: "newest", label: "Newest listed" },
  { value: "popular", label: "Most popular" },
];

// The page address holds the filters: ?q=jazz&city=Nairobi&free=1&max=2000&from=2026-11-01&sort=newest
function toApiQuery(params: URLSearchParams, page: number): string {
  const out = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });

  for (const key of ["q", "city", "country", "category", "from", "to", "sort"]) {
    const value = params.get(key);
    if (value) out.set(key, value);
  }
  if (params.get("free") === "1") out.set("free", "true");

  const max = params.get("max");
  if (max && Number.isFinite(Number(max)) && Number(max) >= 0) {
    out.set("maxPriceCents", String(Math.round(Number(max) * 100))); // typed in shillings, sent in cents
  }

  return out.toString();
}

export default function Events() {
  useTitle("Events");

  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);

  const get = (key: string) => params.get(key) ?? "";
  const q = get("q");
  const city = get("city");
  const country = get("country");
  const category = get("category");
  const from = get("from");
  const to = get("to");
  const max = get("max");
  const free = get("free") === "1";
  const sort = get("sort") || "soonest";

  // What is typed in the search box is only sent after a short pause.
  const [text, setText] = useState(q);
  const debounced = useDebouncedValue(text.trim(), 400);

  function update(changes: Record<string, string>) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true }
    );
  }

  useEffect(() => {
    if (debounced !== q) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  function clearAll() {
    setText("");
    setParams({}, { replace: true });
  }

  const options = useQuery({
    queryKey: ["event-filters"],
    queryFn: () => api.get<EventFilterOptions>("/events/filters"),
    staleTime: 5 * 60_000,
  });

  const rangeBad = Boolean(from && to && from > to);

  const query = useInfiniteQuery({
    queryKey: ["events", "search", params.toString()],
    initialPageParam: 1,
    enabled: !rangeBad,
    queryFn: ({ pageParam }) => api.list<EventSummary>(`/events?${toApiQuery(params, pageParam)}`),
    getNextPageParam: (last) => (last.meta.page * last.meta.limit < last.meta.total ? last.meta.page + 1 : undefined),
  });

  const events = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.meta.total ?? 0;

  // Chips for what is switched on, each one removes its own filter.
  const active: { label: string; clear: () => void }[] = [];
  if (q) active.push({ label: `"${q}"`, clear: () => { setText(""); update({ q: "" }); } });
  if (city) active.push({ label: city, clear: () => update({ city: "" }) });
  if (country) active.push({ label: country, clear: () => update({ country: "" }) });
  if (category) active.push({ label: CATEGORY_LABEL[category] ?? category, clear: () => update({ category: "" }) });
  if (from) active.push({ label: `From ${formatDate(`${from}T12:00:00+03:00`)}`, clear: () => update({ from: "" }) });
  if (to) active.push({ label: `Until ${formatDate(`${to}T12:00:00+03:00`)}`, clear: () => update({ to: "" }) });
  if (free) active.push({ label: "Free events", clear: () => update({ free: "" }) });
  if (max) active.push({ label: `Up to KES ${max}`, clear: () => update({ max: "" }) });

  const filterCount = active.filter((a) => !a.label.startsWith('"')).length;
  const nothingFound = query.isSuccess && events.length === 0;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-fg sm:text-4xl">Events</h1>
        <p className="mt-2 text-sm text-muted">
          {query.isSuccess ? `${total} ${total === 1 ? "event" : "events"} found.` : "Find something to go to."}
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-[1fr_14rem_auto] md:items-end">
        <SearchInput label="Search" value={text} onChange={setText} placeholder="Event, artist, venue, city or organizer" />

        <SelectField label="Sort by" value={sort} onChange={(e) => update({ sort: e.target.value === "soonest" ? "" : e.target.value })}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </SelectField>

        <Button
          variant="secondary"
          className="md:hidden"
          icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters{filterCount > 0 ? ` (${filterCount})` : ""}
        </Button>
      </div>

      <div className={cx("mb-6 rounded-2xl border border-line bg-panel p-5", showFilters ? "block" : "hidden", "md:block")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField label="Category" value={category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">Any category</option>
            {(options.data?.categories ?? []).map((c) => (
              <option key={c.value} value={c.value}>
                {CATEGORY_LABEL[c.value] ?? c.value} ({c.count})
              </option>
            ))}
          </SelectField>
          <SelectField label="City" value={city} onChange={(e) => update({ city: e.target.value })}>
            <option value="">Any city</option>
            {(options.data?.cities ?? []).map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </SelectField>

          <SelectField label="Country" value={country} onChange={(e) => update({ country: e.target.value })}>
            <option value="">Any country</option>
            {(options.data?.countries ?? []).map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </SelectField>

          <Field label="From" type="date" value={from} onChange={(e) => update({ from: e.target.value })} />
          <Field
            label="Until"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => update({ to: e.target.value })}
            error={rangeBad ? "Must be on or after the start date" : undefined}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <Field
            label="Highest ticket price (KES)"
            inputMode="numeric"
            placeholder="2000"
            value={max}
            onChange={(e) => update({ max: e.target.value.replace(/[^\d]/g, "") })}
            hint="Shows events with at least one ticket at or below this."
          />

          <label className="flex h-11 cursor-pointer items-center gap-3 text-sm font-medium text-fg">
            <input
              type="checkbox"
              checked={free}
              onChange={(e) => update({ free: e.target.checked ? "1" : "" })}
              className="size-4 accent-brand"
            />
            Free events only
          </label>
        </div>
      </div>

      {active.length > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {active.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.clear}
              className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm text-gold transition-colors hover:bg-gold/20"
              aria-label={`Remove filter ${item.label}`}
            >
              {item.label}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={clearAll} className="px-2 text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            Clear all
          </button>
        </div>
      ) : null}

      {nothingFound ? (
        <EmptyState
          icon={<SearchX className="size-6" aria-hidden="true" />}
          title="No events match"
          text={active.length > 0 ? "Try removing a filter, or search for something else." : "New events are added all the time. Check back soon."}
          action={
            active.length > 0 ? (
              <Button variant="secondary" onClick={clearAll}>
                Clear all filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <EventGrid
          events={events}
          loading={query.isPending && !rangeBad}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.hasNextPage ? (
        <div className="mt-10 flex justify-center">
          <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            Load more events
          </Button>
        </div>
      ) : null}
    </section>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Events.tsx
// ==========================================