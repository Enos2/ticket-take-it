// New file: frontend/src/pages/App.tsx
// Initial foundation screen; discovery and account flows will be implemented in later milestones.

import { CalendarDays, Globe2, ShieldCheck, TicketCheck } from "lucide-react";

const principles = [
  {
    icon: Globe2,
    title: "Events worldwide",
    description: "Discover experiences across countries, cities and timezones.",
  },
  {
    icon: TicketCheck,
    title: "Secure digital tickets",
    description: "A foundation for unique ticket IDs, QR verification and printable tickets.",
  },
  {
    icon: CalendarDays,
    title: "Flexible event formats",
    description: "Plan for assigned seats, VIP categories and general admission.",
  },
  {
    icon: ShieldCheck,
    title: "Security by design",
    description: "Server-authoritative permissions, orders, payments and ticket status.",
  },
];

export function App() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Ticket Take It home">
          <span className="brand-mark">T</span>
          <span>Ticket <strong>Take It</strong></span>
        </a>
        <span className="status-pill"><span className="status-dot" /> Foundation preview</span>
      </header>

      <section className="hero">
        <p className="eyebrow">YOUR NEXT EXPERIENCE STARTS HERE</p>
        <h1>Discover more.<br /><span>Experience everything.</span></h1>
        <p className="hero-copy">
          One destination for discovering events, booking tickets and bringing people together around the world.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href="#foundation">Explore the platform</a>
          <span className="hero-note">International-ready foundation</span>
        </div>
        <div className="hero-orbit orbit-one" aria-hidden="true" />
        <div className="hero-orbit orbit-two" aria-hidden="true" />
      </section>

      <section id="foundation" className="principles-section">
        <div className="section-heading">
          <p className="eyebrow">BUILT FOR THE WHOLE EXPERIENCE</p>
          <h2>More than a ticket.</h2>
          <p>The initial application foundation is in place. Transactional features will be added in tested stages.</p>
        </div>
        <div className="principle-grid">
          {principles.map(({ icon: Icon, title, description }) => (
            <article className="principle-card" key={title}>
              <span className="principle-icon"><Icon size={23} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span>© {new Date().getFullYear()} Ticket Take It</span>
        <span>Discover. Book. Experience.</span>
      </footer>
    </main>
  );
}
