// ==========================================
// FILE: frontend/src/components/Footer.tsx
// PURPOSE: Page footer.
// ==========================================
import { Ticket } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <Ticket className="size-4 text-gold" aria-hidden="true" />
          <span>Ticket Take It · Your World. Your Moment.</span>
        </div>
        <span>© {new Date().getFullYear()} Ticket Take It</span>
      </div>
    </footer>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/Footer.tsx
// ==========================================
