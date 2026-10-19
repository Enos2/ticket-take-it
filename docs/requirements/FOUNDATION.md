# Ticket Take It — Foundation Requirements

## Product
An international event marketplace with discovery, seller-managed event listings, ticket sales, seating, receipts, QR verification, reviews and seller analytics.

## Confirmed decisions
- International architecture from day one.
- M-Pesa, cards and additional payment methods where provider/country eligibility permits.
- Assigned seating and general admission.
- Commission-based revenue model.
- New GitHub repository named `ticket-take-it` (subject to availability).

## Account classes
- Buyer
- Private seller
- Corporate seller and team members
- Event scanner
- Support administrator
- Platform administrator
- Superadmin

## Required ticket lifecycle
Draft inventory -> temporary hold (if applicable) -> order pending -> payment confirmed -> ticket issued -> checked in OR refunded/cancelled/revoked.

Ticket status and entry authorization are controlled by the server. QR codes must not contain private personal data. A QR token is not sufficient on its own: verification must consult authoritative ticket status and atomically prevent duplicate check-in.

## Payment invariants
- Server calculates prices, fees and commission.
- Provider webhooks are signature-verified.
- Payment processing is idempotent.
- Ticket issuance is idempotent.
- Payment state and ticket state are reconciled.
- Seller payouts are separate from gross sales and payment captures.
- Do not store raw card security codes.

## Internationalization
- Store event start/end timestamps and an IANA timezone identifier.
- Store currency code with every monetary amount.
- Preserve original transaction amounts on receipts.
- Display converted prices as estimates unless the buyer checks out in that currency.
- Enable payment methods only for supported countries, currencies, seller types and provider accounts.

## Release gates
No public paid ticket sales until authentication/authorization, payment verification, ticket issuance, QR redemption, refunds, audit logs, backup recovery and security tests have passed.
