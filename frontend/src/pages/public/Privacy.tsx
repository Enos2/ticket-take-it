// ==========================================
// FILE: frontend/src/pages/public/Privacy.tsx
// PURPOSE: Privacy Policy: what we collect, why, who sees it and what you can do.
// ==========================================
import { Link } from "react-router-dom";
import LegalPage, { Bullets, ContactLink, P, Section } from "../../components/legal/LegalPage";
import { SITE } from "../../lib/site";

const link = "font-semibold text-gold underline-offset-4 hover:underline";

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <Section title="1. Who we are">
        <P>
          {SITE.companyName} runs {SITE.name}. This policy explains what personal information we collect, what we do with it, and the
          choices you have. We handle your information in line with the data protection laws that apply to us, including Kenya's Data
          Protection Act, 2019.
        </P>
      </Section>

      <Section title="2. What we collect">
        <Bullets
          items={[
            "Your account: name, email address, optional phone number, and your password (stored only in scrambled form, so nobody can read it).",
            "Your activity: the tickets you reserve and buy, your orders, and your check-ins at events.",
            "Payments: the amount, the date and the payment provider's reference for each payment. Your full card number and M-Pesa PIN never reach our servers. For M-Pesa we keep a masked version of your number.",
            "If you are an organiser: your business name, email and phone, your payout details (M-Pesa number or bank account), and the record of your sales, commission and payouts.",
            "Technical information: your IP address and basic details about requests, to keep the service secure. If the site crashes in your browser, a short report is sent to us with the error and the page path.",
          ]}
        />
      </Section>

      <Section title="3. How we use it">
        <Bullets
          items={[
            "To run the service: take payments, issue tickets, let organisers admit you at the door.",
            "To email you about your account and orders: confirmations, refunds, cancellations and security messages. We do not send marketing emails.",
            "To keep people safe: prevent fraud, abuse and duplicate tickets.",
            "To meet legal and accounting duties.",
          ]}
        />
      </Section>

      <Section title="4. Who sees it">
        <P>We do not sell your personal information. We share it only where needed:</P>
        <Bullets
          items={[
            "Organisers see the name and email of people who hold tickets for their events, so they can run the event and contact attendees.",
            "Payment providers: Paystack and Safaricom (M-Pesa) process your payment.",
            "Service providers that run the platform for us, such as our email sender, our hosting and database providers, and an error-monitoring service.",
            "Authorities, when the law requires it.",
          ]}
        />
        <P>Some of these providers store data outside Kenya, including in the United States.</P>
      </Section>

      <Section title="5. How long we keep it">
        <P>
          We keep your account information until you delete your account. Records of orders, payments and payouts are kept because
          accounting and tax rules require it. When you delete your account, these records stay but no longer show who you are. Security
          logs are kept for a limited time.
        </P>
      </Section>

      <Section title="6. Your choices and rights">
        <Bullets
          items={[
            <>
              See and correct your details under{" "}
              <Link to="/account/settings" className={link}>
                Account, then Settings
              </Link>
              .
            </>,
            "Delete your account in the same place. It erases your name, email, phone and password. You can't delete it while you hold tickets for upcoming events or, as an organiser, have live events or a balance, because other people's money depends on them.",
            <>
              Ask us for a copy of your information, or to restrict how we use it, by writing to <ContactLink />.
            </>,
            "If you think we have handled your information badly, you can complain to the Office of the Data Protection Commissioner in Kenya.",
          ]}
        />
      </Section>

      <Section title="7. Cookies and storage">
        <P>
          We store a sign-in token in your browser's local storage so you stay signed in. We do not use advertising or tracking cookies.
        </P>
      </Section>

      <Section title="8. Security">
        <P>
          Information travels over encrypted connections, passwords are stored in scrambled form, and access to personal information is
          limited to what staff need. No system is perfectly secure, so please use a strong, unique password.
        </P>
      </Section>

      <Section title="9. Children">
        <P>The service is not meant for children under 18 acting alone. A parent or guardian can buy tickets for a child.</P>
      </Section>

      <Section title="10. Changes and contact">
        <P>
          If we change this policy in a way that matters, we will tell you before it applies. Privacy questions or requests: <ContactLink />.
        </P>
      </Section>
    </LegalPage>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Privacy.tsx
// ==========================================