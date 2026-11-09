// ==========================================
// FILE: frontend/src/components/HeartButton.tsx
// PURPOSE: Save an event. On a card it is a round icon, on the event page it is a labelled button.
// ==========================================
import { Heart } from "lucide-react";
import { cx } from "../lib/cx";
import { useFavorite } from "../lib/engagement";

interface HeartButtonProps {
  eventId: string;
  title: string;
  withLabel?: boolean;
}

export default function HeartButton({ eventId, title, withLabel = false }: HeartButtonProps) {
  const { saved, toggle, pending } = useFavorite(eventId);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from your saved events` : `Save ${title}`}
      className={cx(
        "transition-colors disabled:opacity-60",
        withLabel
          ? "inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm font-semibold text-fg hover:border-gold"
          : "flex size-9 items-center justify-center rounded-full bg-ink/70 backdrop-blur hover:bg-ink"
      )}
    >
      <Heart className={cx("size-4", saved ? "fill-brand text-brand" : "text-fg")} aria-hidden="true" />
      {withLabel ? (saved ? "Saved" : "Save") : null}
    </button>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/HeartButton.tsx
// ==========================================