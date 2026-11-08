// ==========================================
// FILE: frontend/src/components/Footer.tsx
// PURPOSE: Page footer with the full logo and the links people look for.
// ==========================================
import { Link } from "react-router-dom";

const LINKS = [
  { to: "/events", label: "Events" },
  { to: "/seller/apply", label: "Sell tickets" },
  { to: "/help", label: "Help" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/refunds", label: "Refunds" },
];

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row md:items-start">
          <div className="flex flex-col items-center gap-3 md:items-start">
            <img src="/logo-full.png" alt="Ticket Take It" width={900} height={550} loading="lazy" className="h-20 w-auto" />
            <p className="text-sm font-semibold text-fg">Your World. Your Moment.</p>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm md:justify-end">
            {LINKS.map((item) => (
              <Link key={item.to} to={item.to} className="text-muted transition-colors hover:text-fg">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <p className="mt-8 border-t border-line pt-6 text-center text-xs text-muted md:text-left">
          © {new Date().getFullYear()} Ticket Take It. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/Footer.tsx
// ==========================================