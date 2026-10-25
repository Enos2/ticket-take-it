// ==========================================
// FILE: frontend/src/components/ui/Button.tsx
// PURPOSE: Button with variants and a loading state.
// ==========================================
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "../../lib/cx";
import { buttonClasses } from "./styles";
import type { ButtonSize, ButtonVariant } from "./styles";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} className={cx(buttonClasses(variant, size), className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ui/Button.tsx
// ==========================================
