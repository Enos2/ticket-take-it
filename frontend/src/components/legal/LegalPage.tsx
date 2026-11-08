// ==========================================
// FILE: frontend/src/components/legal/LegalPage.tsx
// PURPOSE: The shared frame and building blocks for the legal pages.
// ==========================================
import type { ReactNode } from "react";
import { SITE } from "../../lib/site";
import { useTitle } from "../../lib/useTitle";
import Alert from "../ui/Alert";

export default function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  useTitle(title);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-extrabold text-fg sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated {SITE.legalUpdated}</p>

      {!SITE.legalReviewed ? (
        <div className="mt-6">
          <Alert variant="info">
            <p className="font-semibold">Draft: not reviewed by a lawyer yet.</p>
            <p className="mt-1">
              This text describes how the platform works, but it has not been checked against the law. Have it reviewed before you take
              real payments, then set VITE_LEGAL_REVIEWED=true to remove this notice.
            </p>
            {SITE.missingSettings.length > 0 ? <p className="mt-1">Still to set: {SITE.missingSettings.join(", ")}.</p> : null}
          </Alert>
        </div>
      ) : null}

      <div className="mt-8 space-y-8">{children}</div>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-fg">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function ContactLink() {
  return SITE.supportEmail ? (
    <a href={`mailto:${SITE.supportEmail}`} className="font-semibold text-gold underline-offset-4 hover:underline">
      {SITE.supportEmail}
    </a>
  ) : (
    <span className="font-semibold text-fg">our support email (to be added)</span>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/legal/LegalPage.tsx
// ==========================================