// ==========================================
// FILE: frontend/src/lib/queryClient.ts
// PURPOSE: Shared React Query client.
// ==========================================
import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Don't retry answers like "not found" or "forbidden". Do retry network trouble and server errors.
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
// ==========================================
// END OF FILE: frontend/src/lib/queryClient.ts
// ==========================================
