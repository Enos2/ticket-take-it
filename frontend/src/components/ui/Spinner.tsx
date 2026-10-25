// ==========================================
// FILE: frontend/src/components/ui/Spinner.tsx
// PURPOSE: Loading indicators.
// ==========================================
import { Loader2 } from "lucide-react";
import { cx } from "../../lib/cx";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-gold", className)} aria-label="Loading" />;
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status">
      <Spinner className="size-8" />
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ui/Spinner.tsx
// ==========================================
