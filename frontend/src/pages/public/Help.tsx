// ==========================================
// FILE: frontend/src/pages/public/Help.tsx
// PURPOSE: Help page: common questions and how to reach us.
// ==========================================
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, LifeBuoy } from "lucide-react";
import { ContactLink } from "../../components/legal/LegalPage";
import Card from "../../components/ui/Card";
import { SITE } from "../../lib/site";
import { useTitle } from "../../lib/useTitle";

const link = "font-semibold text-gold underline-offset-4 hover:underline";

function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-line bg-panel p-4 open:border-gold/50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-fg [&::-webkit-details-marker]:hidden">
        {question}
        <ChevronDown className="size-4 shrink-0 text-gold transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </details>
  );
}

export default function Help() {
  useTitle("Help");

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-extrabold text-fg sm:text-4xl">Help</h1>
      <p className="mt-2 text-sm text-muted">Quick answers, and how to reach us.</p>

      <h2 className="mt-10 mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Buying tickets</h2>
      <div className="space-y-3">
        <Faq question="I paid, but I can't see my tickets">
          <p>
            Open <Link to="/account/tickets" className={link}>My tickets</Link>. Card payments usually show up within seconds, and M-Pesa
            payments can take a minute or two. We also email you a confirmation.
          </p>
          <p>
            If you were charged and nothing shows after 15 minutes, write to us with your order reference. Our system matches payments by
            itself, so you will either get your tickets or be refunded.
          </p>
        </Faq>

        <Faq question="The M-Pesa prompt never arrived">
          <p>
            Check that the number is a Safaricom number and is typed correctly, for example 0712 345 678. Wait a minute, then choose
            "Try again or choose another method" on the checkout page. You can also pay by card instead.
          </p>
        </Faq>

        <Faq question="My reservation ran out">
          <p>
            Tickets are held for about {SITE.holdMinutes} minutes while you pay. After that they are released so others can buy them.
            Go back to the event and choose your tickets again.
          </p>
        </Faq>

        <Faq question="How do I get into the event?">
          <p>
            Open <Link to="/account/tickets" className={link}>My tickets</Link> on your phone and show the QR code at the entrance. Each
            code works once, so do not share it. Entry opens about 12 hours before the start and closes a few hours after the end.
          </p>
        </Faq>

        <Faq question="Can I get a refund?">
          <p>
            If an event is cancelled, you are refunded in full automatically. For other cases, read our{" "}
            <Link to="/refunds" className={link}>Refund Policy</Link>.
          </p>
        </Faq>
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Your account</h2>
      <div className="space-y-3">
        <Faq question="I forgot my password">
          <p>
            Choose <Link to="/forgot-password" className={link}>Forgot your password</Link> on the sign-in page. We email you a link that
            works once for an hour.
          </p>
        </Faq>

        <Faq question="I didn't get the verification email">
          <p>
            Sign in and use "Resend link" in the bar at the top of the page. Check your spam folder too. The link works for 24 hours.
          </p>
        </Faq>

        <Faq question="How do I change my details or delete my account?">
          <p>
            Go to <Link to="/account/settings" className={link}>Account, then Settings</Link>. You can edit your name and phone, change
            your password, or delete the account.
          </p>
        </Faq>
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Organisers</h2>
      <div className="space-y-3">
        <Faq question="How do I sell tickets?">
          <p>
            Go to <Link to="/seller/apply" className={link}>Sell tickets</Link> and apply. Once we approve you, create an event, add your
            ticket types and submit it for review. When it is approved it goes on sale.
          </p>
        </Faq>

        <Faq question="When do I get paid?">
          <p>
            Your Earnings page shows what is on hold and what is ready. Earnings are released a few days after your event ends, then we
            pay them to the M-Pesa number or bank account you saved.
          </p>
        </Faq>
      </div>

      <Card className="mt-12 flex gap-4 p-6">
        <LifeBuoy className="mt-0.5 size-6 shrink-0 text-gold" aria-hidden="true" />
        <div>
          <h2 className="font-bold text-fg">Still stuck?</h2>
          <p className="mt-1 text-sm text-muted">
            Write to <ContactLink /> and include your order reference if you have one. It starts with ORD- and is on your order page.
          </p>
        </div>
      </Card>
    </section>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Help.tsx
// ==========================================