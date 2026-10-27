// ==========================================
// FILE: frontend/src/components/Footer.tsx
// PURPOSE: Page footer with the full logo.
// ==========================================
export default function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6">
        <img src="/logo-full.png" alt="Ticket Take It" width={900} height={550} loading="lazy" className="h-20 w-auto" />

        <div className="text-center text-sm text-muted sm:text-right">
          <p className="font-semibold text-fg">Your World. Your Moment.</p>
          <p className="mt-1">© {new Date().getFullYear()} Ticket Take It</p>
        </div>
      </div>
    </footer>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/Footer.tsx
// ==========================================