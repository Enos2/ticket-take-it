// ==========================================
// FILE: frontend/src/components/ProtectedRoute.tsx
// PURPOSE: Checks if the user is logged in.
// ==========================================
import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../lib/authStore";

export default function ProtectedRoute() {
  const token = useAuthStore((state) => state.token);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
// ==========================================
// END OF FILE: frontend/src/components/ProtectedRoute.tsx
// LOCATION: frontend/src/components/ProtectedRoute.tsx
// LAST UPDATED: October 20, 2026
// ==========================================