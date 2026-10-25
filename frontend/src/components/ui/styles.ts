// ==========================================
// FILE: frontend/src/components/ui/styles.ts
// PURPOSE: Button styles, shared so links can look like buttons too.
// ==========================================
import { cx } from "../../lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-line bg-panel text-fg hover:border-gold hover:text-gold",
  ghost: "text-muted hover:bg-panel hover:text-fg",
  danger: "border border-brand text-brand hover:bg-brand hover:text-white",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cx(base, variants[variant], sizes[size]);
}
// ==========================================
// END OF FILE: frontend/src/components/ui/styles.ts
// ==========================================
