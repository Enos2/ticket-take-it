// ==========================================
// FILE: frontend/src/lib/useInvalidateEvent.ts
// PURPOSE: After any change to an event, refresh every screen that shows it.
// ==========================================
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useInvalidateEvent() {
  const queryClient = useQueryClient();

  return useCallback(
    (event: { id: string; slug?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ["seller-event", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["seller-summary", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["seller-attendees", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["seller-events"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] }); // public lists
      if (event.slug) void queryClient.invalidateQueries({ queryKey: ["event", event.slug] }); // public page
    },
    [queryClient]
  );
}
// ==========================================
// END OF FILE: frontend/src/lib/useInvalidateEvent.ts
// ==========================================