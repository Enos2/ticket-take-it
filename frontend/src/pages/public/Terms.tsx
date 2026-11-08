// ==========================================
// FILE: frontend/src/pages/public/Terms.tsx
// PURPOSE: Terms of Service for buyers and organisers.
// ==========================================
import { Link } from "react-router-dom";
import LegalPage, { Bullets, ContactLink, P, Section } from "../../components/legal/LegalPage";
import { SITE } from "../../lib/site";

const link = "font-semibold text-gold underline-offset-4 hover:underline";

export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <Section title="1. About these terms">
        <P>
          These terms are an agreement between you and {SITE.companyName}. They apply when you create an account, buy tickets or sell
          tickets on {SITE.name}. If you do not agree to them, please do not use the service.
        </P>
        <P>
          {SITE.name} is a marketplace. Event organisers list events and set their own ticket prices. We provide the platform, take
          payments and issue tickets. The organiser, not us, is responsible for the event itself.
        </P>
      </Section>

      <Section title="2. Your account">
        <Bullets
          items={[
            "You must be at least 18, or have the permission of a parent or guardian.",
            "Give us true information and keep it up to date. You can change it under Account, then Settings.",
            "Keep your password private. You are responsible for what happens under your account.",
            "We can suspend or close an account that is used for fraud, abuse or anything that breaks these terms.",
          ]}
        />
      </Section>

      <Section title="3. Buying tickets">
        <Bullets
          items={[
            `When you choose tickets, we hold them for about ${SITE.holdMinutes} minutes while you pay. If you do not pay in that time, they are released.`,
            "Your tickets are issued only after the payment provider confirms the payment. A message on your screen is not enough on its own.",
            "Prices are shown in the currency of the event. The price you see at checkout is the price you pay.",
            "If a payment arrives for tickets that are no longer available, or you are charged twice, we refund it.",
          ]}
        />
      </Section>

      <Section title="4. Using your tickets">
        <Bullets
          items={[
            "Each ticket has its own QR code, and the code works once. Whoever scans it first is admitted.",
            "Do not share, post or sell your QR code. If someone else uses it first, we cannot replace the ticket.",
            "Tickets are not transferable or resellable through the platform.",
            "Entry is also subject to the organiser's conditions, such as age limits, bag rules and entry times.",
          ]}
        />
      </Section>

      <Section title="5. Payments">
        <P>
          Payments are handled by our payment providers (currently Paystack and M-Pesa). We never see or store your full card number or
          your M-Pesa PIN. We do not add extra fees on top of the ticket price at checkout.
        </P>
      </Section>

      <Section title="6. Cancellations and refunds">
        <P>
          If an event is cancelled you are refunded in full. Other cases are covered in our{" "}
          <Link to="/refunds" className={link}>
            Refund Policy
          </Link>
          , which is part of these terms.
        </P>
      </Section>

      <Section title="7. Rules for everyone">
        <P>You must not:</P>
        <Bullets
          items={[
            "use the service for fraud, to launder money, or to sell tickets you do not have the right to sell;",
            "use bots, scrapers or other automated tools to buy tickets or collect data;",
            "try to break, overload or get around the security of the service;",
            "list events that are false, misleading or illegal.",
          ]}
        />
      </Section>

      <Section title="8. If you are an organiser">
        <Bullets
          items={[
            "You apply to become an organiser, and we may approve or decline the application. Every event is reviewed before it goes on sale.",
            "We can reject an event, or take a live event down, if it breaks these terms or we believe buyers are at risk. Tickets already sold stay valid unless the event is cancelled.",
            "You are responsible for the accuracy of your event details and for having the permits, licences and insurance your event needs.",
            "We keep a commission from each ticket sale. The rate that applies to you is always shown on your Earnings page. The rest of the sale is yours.",
            "Earnings are released for payout a few days after your event ends, so cancellations and refunds can be settled first. We pay to the M-Pesa number or bank account you saved. Keep those details correct.",
            "If you cancel an event, buyers are refunded and the refunds are taken from your earnings.",
            "You give us permission to show your event details, images and name on the platform.",
            "You must follow the tax rules that apply to your business. We do not give tax advice.",
          ]}
        />
      </Section>

      <Section title="9. Our responsibility">
        <P>
          We work to keep the service available and accurate, but we cannot promise it will never be interrupted. To the extent the law
          allows, we are not responsible for events that are cancelled, changed or poorly run by organisers, or for losses we could not
          reasonably have foreseen. Nothing in these terms limits any right you have under the law that cannot be limited.
        </P>
      </Section>

      <Section title="10. Changes, ending and the law">
        <P>
          We may update these terms. If a change matters, we will tell you by email or on the site before it applies. You can close your
          account at any time under Account, then Settings. These terms are governed by the laws of Kenya, and the courts of Kenya can
          decide disputes about them.
        </P>
      </Section>

      <Section title="11. Contact">
        <P>
          Questions about these terms: <ContactLink />.
        </P>
      </Section>
    </LegalPage>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Terms.tsx
// ==========================================