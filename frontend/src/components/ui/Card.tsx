// ==========================================
// FILE: frontend/src/components/ui/Card.tsx
// PURPOSE: Panel surface.
// ==========================================
import type { HTMLAttributes } from "react";
import { cx } from "../../lib/cx";

export default function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-2xl border border-line bg-panel", className)} {...rest} />;
}
// ==========================================
// END OF FILE: frontend/src/components/ui/Card.tsx
// ==========================================
