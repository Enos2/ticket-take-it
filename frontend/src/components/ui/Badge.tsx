// ==========================================
// FILE: frontend/src/components/ui/Badge.tsx
// PURPOSE: Small label.
// ==========================================
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

type Tone = "neutral" | "gold" | "brand" | "ok";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-panel-2 text-muted",
  gold: "border-gold/40 bg-gold/10 text-gold",
  brand: "border-brand/40 bg-brand/10 text-brand",
  ok: "border-ok/40 bg-ok/10 text-ok",
};

export default function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ui/Badge.tsx
// ==========================================
