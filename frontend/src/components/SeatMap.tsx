// ==========================================
// FILE: frontend/src/components/SeatMap.tsx
// PURPOSE: A seat map: sections, rows and numbered seats. Used by buyers to pick seats and by sellers to manage them.
// ==========================================
import { cx } from "../lib/cx";
import { TIER_LABEL } from "../lib/events";
import { formatMoney } from "../lib/format";
import type { MapSeat, MapSection } from "../lib/seating";

// One style per seat state. Colour is never the only signal: taken seats are also disabled and named in their label.
const SEAT_STYLE: Record<string, string> = {
  available: "border-line bg-panel-2 text-fg hover:border-gold",
  selected: "border-gold bg-gold text-ink",
  held: "cursor-not-allowed border-line bg-line/40 text-muted opacity-60",
  taken: "cursor-not-allowed border-line bg-ink text-muted/40",
  sold: "cursor-not-allowed border-line bg-ink text-muted/40",
  blocked: "border-brand/60 bg-brand/20 text-brand hover:border-brand",
  given: "cursor-not-allowed border-ok bg-ok/20 text-ok",
};

const SEAT_NAME: Record<string, string> = {
  available: "available",
  selected: "selected",
  held: "held by another buyer",
  taken: "taken",
  sold: "sold",
  blocked: "kept for guests",
  given: "given to a guest",
};

// A small key under the map.
export function SeatLegend({ states }: { states: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Seat colours">
      {states.map((state) => (
        <li key={state} className="flex items-center gap-2">
          <span className={cx("size-5 rounded border", SEAT_STYLE[state])} aria-hidden="true" />
          {SEAT_NAME[state]}
        </li>
      ))}
    </ul>
  );
}

interface SeatMapProps<S extends string> {
  sections: MapSection<S>[];
  selected: ReadonlySet<string>;
  isSelectable: (state: S) => boolean; // which seats can be clicked
  onToggle: (seat: MapSeat<S>, section: MapSection<S>) => void;
}

export default function SeatMap<S extends string>({ sections, selected, isSelectable, onToggle }: SeatMapProps<S>) {
  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-md rounded-b-full border-t-4 border-gold/60 pt-2 text-center text-xs tracking-widest text-muted uppercase">
        Stage / front
      </div>

      {sections.map((section) => (
        <section key={section.id} aria-label={section.name}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-semibold text-fg">{section.name}</h4>
            <p className="text-sm text-muted">
              {section.ticketType.name} · {TIER_LABEL[section.ticketType.tier]} ·{" "}
              {formatMoney(section.ticketType.priceCents, section.ticketType.currency)}
            </p>
          </div>

          {/* wide rows scroll sideways instead of squashing the seats */}
          <div className="overflow-x-auto pb-2">
            <div className="inline-flex min-w-full flex-col gap-1.5">
              {section.rows.map((row) => (
                <div key={row.row} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-right text-xs font-semibold text-muted">{row.row}</span>
                  <div className="flex gap-1.5">
                    {row.seats.map((seat) => {
                      const isSelected = selected.has(seat.id);
                      const clickable = isSelected || isSelectable(seat.state);
                      const stateName = SEAT_NAME[isSelected ? "selected" : seat.state];

                      return (
                        <button
                          key={seat.id}
                          type="button"
                          disabled={!clickable}
                          onClick={() => onToggle(seat, section)}
                          aria-pressed={isSelected}
                          aria-label={`${section.name}, row ${row.row}, seat ${seat.number}, ${stateName}`}
                          className={cx(
                            "size-8 shrink-0 rounded-md border text-xs font-semibold transition-colors",
                            SEAT_STYLE[isSelected ? "selected" : seat.state]
                          )}
                        >
                          {seat.number}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/SeatMap.tsx
// ==========================================