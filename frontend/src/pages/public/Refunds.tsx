// ==========================================
// FILE: frontend/src/pages/public/Refunds.tsx
// PURPOSE: Refund Policy: when you get your money back and how.
// ==========================================
import LegalPage, { Bullets, ContactLink, P, Section } from "../../components/legal/LegalPage";

export default function Refunds() {
  return (
    <LegalPage title="Refund Policy">
      <Section title="1. If an event is cancelled">
        <P>
          If the organiser or {"we"} cancel an event, every ticket for it stops working and you are refunded the full ticket price. You
          do not need to ask. You will get an email when the refund starts.
        </P>
      </Section>

      <Section title="2. If an event is paused or changed">
        <Bullets
          items={[
            "If we take an event down for review, sales stop but the tickets you already bought stay valid. If the event is later cancelled, you are refunded.",
            "If the date, time or venue changes, your tickets stay valid for the new details.",
            "If a change means you cannot attend, contact us. Whether you can get a refund then depends on the organiser and on the law.",
          ]}
        />
      </Section>

      <Section title="3. When something went wrong with a payment">
        <P>We refund the full amount if:</P>
        <Bullets
          items={[
            "you were charged twice for the same order;",
            "your payment arrived after the tickets had sold out or your reservation had ended, and we could not issue tickets;",
            "you paid an amount that does not match the order.",
          ]}
        />
      </Section>

      <Section title="4. If you simply change your mind">
        <P>
          Tickets are not refundable if you change your mind, unless the organiser agrees or the law says otherwise. If you have a good
          reason, write to us with your order reference and we will ask the organiser.
        </P>
      </Section>

      <Section title="5. How refunds are paid, and how long they take">
        <Bullets
          items={[
            "Card and Paystack payments go back to the payment method you used.",
            "M-Pesa payments are sent back to the phone number that paid. Our team does this by hand, so it can take a little longer.",
            "Timing depends on your bank or mobile provider. It is usually within a few working days, and sometimes up to 10 working days.",
          ]}
        />
      </Section>

      <Section title="6. How to ask">
        <P>
          Email <ContactLink /> with your order reference (it starts with ORD- and is on your order page and receipt) and tell us what
          happened.
        </P>
      </Section>
    </LegalPage>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Refunds.tsx
// ==========================================