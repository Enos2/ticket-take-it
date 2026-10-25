// ==========================================
// FILE: frontend/src/components/ui/Chips.tsx
// PURPOSE: A row of filter buttons where one is selected.
// ==========================================
import { cx } from "../../lib/cx";

interface ChipsProps<T extends string> {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}

export default function Chips<T extends string>({ label, options, value, onChange }: ChipsProps<T>) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cx(
            "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
            value === option.value ? "border-gold bg-gold/10 text-gold" : "border-line text-muted hover:text-fg"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ui/Chips.tsx
// ==========================================