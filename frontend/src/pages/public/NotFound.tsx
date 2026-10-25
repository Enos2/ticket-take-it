// ==========================================
// FILE: frontend/src/pages/public/NotFound.tsx
// PURPOSE: Shown for addresses that don't exist.
// ==========================================
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import EmptyState from "../../components/ui/EmptyState";
import { buttonClasses } from "../../components/ui/styles";
import { useTitle } from "../../lib/useTitle";

export default function NotFound() {
  useTitle("Page not found");

  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <EmptyState
        icon={<Compass className="size-6" aria-hidden="true" />}
        title="Page not found"
        text="The page you are looking for doesn't exist or has moved."
        action={
          <Link to="/" className={buttonClasses("primary")}>
            Back to home
          </Link>
        }
      />
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/NotFound.tsx
// ==========================================