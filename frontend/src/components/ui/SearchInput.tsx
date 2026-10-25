// ==========================================
// FILE: frontend/src/components/ui/SearchInput.tsx
// PURPOSE: A labelled search box.
// ==========================================
import { useId } from "react";
import { Search } from "lucide-react";

interface SearchInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchInput({ label, value, onChange, placeholder }: SearchInputProps) {
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-lg border border-line bg-ink pr-3.5 pl-10 text-sm text-fg placeholder:text-muted/70 focus:border-gold focus:outline-none"
        />
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ui/SearchInput.tsx
// ==========================================