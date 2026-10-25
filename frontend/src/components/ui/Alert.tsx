// ==========================================
// FILE: frontend/src/components/ui/Alert.tsx
// PURPOSE: Inline message for errors, success and information.
// ==========================================
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cx } from "../../lib/cx";

type Variant = "error" | "success" | "info";

const styles: Record<Variant, string> = {
  error: "border-brand/40 bg-brand/10 text-fg",
  success: "border-ok/40 bg-ok/10 text-fg",
  info: "border-gold/40 bg-gold/10 text-fg",
};

const iconColor: Record<Variant, string> = {
  error: "text-brand",
  success: "text-ok",
  info: "text-gold",
};

const icons = { error: AlertCircle, success: CheckCircle2, info: Info };

export default function Alert({ variant = "error", children }: { variant?: Variant; children: ReactNode }) {
  const Icon = icons[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-lg border p-3.5 text-sm", styles[variant])}>
      <Icon className={cx("mt-0.5 size-4 shrink-0", iconColor[variant])} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ui/Alert.tsx
// ==========================================
