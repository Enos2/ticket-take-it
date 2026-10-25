// ==========================================
// FILE: frontend/src/lib/useTitle.ts
// PURPOSE: Sets the browser tab title.
// ==========================================
import { useEffect } from "react";

export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Ticket Take It` : "Ticket Take It";
  }, [title]);
}
// ==========================================
// END OF FILE: frontend/src/lib/useTitle.ts
// ==========================================
