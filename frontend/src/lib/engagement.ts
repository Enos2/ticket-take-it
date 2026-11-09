// ==========================================
// FILE: frontend/src/lib/engagement.ts
// PURPOSE: The save and follow buttons' logic: instant feedback, and a trip to sign-in when needed.
// ==========================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./authStore";

// One list of ids is loaded once and shared by every button on the page.
function useSavedToggle(key: string, base: string, itemId: string, refreshKeys: string[]) {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const ids = useQuery({
    queryKey: [key],
    queryFn: () => api.get<string[]>(`${base}/ids`),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
  const saved = Boolean(ids.data?.includes(itemId));

  const mutation = useMutation({
    mutationFn: (next: boolean) => (next ? api.post(`${base}/${itemId}`) : api.delete(`${base}/${itemId}`)),
    // The heart fills in straight away, and goes back if the server says no.
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: [key] });
      const previous = queryClient.getQueryData<string[]>([key]) ?? [];
      queryClient.setQueryData<string[]>([key], next ? [...new Set([...previous, itemId])] : previous.filter((id) => id !== itemId));
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context) queryClient.setQueryData([key], context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [key] });
      refreshKeys.forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });

  function toggle() {
    if (!user) {
      navigate("/login", { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    mutation.mutate(!saved);
  }

  return { saved, toggle, pending: mutation.isPending };
}

export const useFavorite = (eventId: string) => useSavedToggle("favorite-ids", "/engagement/favorites", eventId, ["favorites"]);

export const useFollow = (sellerId: string) => useSavedToggle("follow-ids", "/engagement/follows", sellerId, ["following", "organizer"]);
// ==========================================
// END OF FILE: frontend/src/lib/engagement.ts
// ==========================================