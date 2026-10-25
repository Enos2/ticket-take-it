// ==========================================
// FILE: frontend/src/lib/useCountdown.ts
// PURPOSE: Seconds left until a moment, updated every second.
// ==========================================
import { useEffect, useState } from "react";

// Returns null when there is no deadline. Reaches 0 and stays there.
export function useCountdown(deadline: string | null | undefined): number | null {
  const target = deadline ? new Date(deadline).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (target === null) return null;
  return Math.max(Math.floor((target - now) / 1000), 0);
}
// ==========================================
// END OF FILE: frontend/src/lib/useCountdown.ts
// ==========================================