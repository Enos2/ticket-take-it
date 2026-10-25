// ==========================================
// FILE: frontend/src/lib/useManagedEvent.ts
// PURPOSE: Gives the event tabs access to the event loaded by the page around them.
// ==========================================
import { useOutletContext } from "react-router-dom";
import type { SellerEvent } from "./types";

export interface ManagedEventContext {
  event: SellerEvent;
}

export function useManagedEvent(): ManagedEventContext {
  return useOutletContext<ManagedEventContext>();
}
// ==========================================
// END OF FILE: frontend/src/lib/useManagedEvent.ts
// ==========================================