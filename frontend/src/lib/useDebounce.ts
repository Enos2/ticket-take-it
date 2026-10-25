// ==========================================
// FILE: frontend/src/lib/useDebounce.ts
// PURPOSE: Waits until someone stops typing before a value is used.
// ==========================================
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
// ==========================================
// END OF FILE: frontend/src/lib/useDebounce.ts
// ==========================================