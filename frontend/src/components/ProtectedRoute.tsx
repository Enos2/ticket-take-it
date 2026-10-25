// ==========================================
// FILE: frontend/src/components/ProtectedRoute.tsx
// PURPOSE: Keeps signed-out visitors, and the wrong roles, out of private pages. Used from phase 2 onwards.
// ==========================================
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/authStore";
import type { Role } from "../lib/types";
import { PageSpinner } from "./ui/Spinner";

interface ProtectedRouteProps {
  roles?: Role[]; // leave out to allow any signed-in person
}

export default function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const location = useLocation();

  if (status === "loading") return <PageSpinner />;

  // After signing in, the login page sends them back to where they were headed.
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;

  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return <Outlet />;
}
// ==========================================
// END OF FILE: frontend/src/components/ProtectedRoute.tsx
// ==========================================