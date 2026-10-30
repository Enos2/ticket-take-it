// ==========================================
// FILE: backend/tests/helpers.ts
// PURPOSE: Shared test helpers: database reset, fixtures, authenticated requests.
// ==========================================
import { createHash, randomBytes } from "crypto";
import request from "supertest";
import type { EventStatus, Role, SellerStatus, TicketTier } from "@prisma/client";
import app from "../src/app";
import { prisma } from "../src/config/database";
import { signAccessToken } from "../src/utils/jwt";

export const api = () => request(app);

const DAY = 24 * 60 * 60 * 1000;
export const inDays = (days: number, extraHours = 0) =>
  new Date(Date.now() + days * DAY + extraHours * 60 * 60 * 1000);

// ---------------------------------------------------------------- database

// Wipes every table. Refuses to run unless the connected database is a test database.
export async function resetDb() {
  const rows = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (!/test/i.test(rows[0]?.db ?? "")) {
    throw new Error(`Refusing to wipe "${rows[0]?.db}". It is not a test database.`);
  }

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "Ticket","Payment","OrderItem","Order","TicketType","Event","SellerProfile","EmailToken","RefreshToken","User" RESTART IDENTITY CASCADE`
  );
}

// ---------------------------------------------------------------- people

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

let counter = 0;

export async function createUser(role: Role = "USER", overrides: { emailVerified?: boolean } = {}) {
  counter++;
  return await prisma.user.create({
    data: {
      email: `user${counter}-${randomBytes(3).toString("hex")}@test.dev`,
      passwordHash: "not-a-real-hash", // these users never log in with a password
      fullName: `Test ${role} ${counter}`,
      role,
      emailVerified: overrides.emailVerified ?? true,
    },
  });
}

export const authHeader = (user: AuthUser) => ({
  Authorization: `Bearer ${signAccessToken({ sub: user.id, email: user.email, role: user.role })}`,
});

export async function createSeller(status: SellerStatus = "APPROVED") {
  const user = await createUser("SELLER");
  const profile = await prisma.sellerProfile.create({
    data: {
      userId: user.id,
      businessName: `Business ${counter}`,
      businessEmail: user.email,
      status,
      approvedAt: status === "APPROVED" ? new Date() : null,
    },
  });
  return { user, profile };
}

// Creates a one-time email token with a known value, the way the email link would carry it.
export async function makeEmailToken(userId: string, type: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  const raw = randomBytes(24).toString("base64url");
  await prisma.emailToken.deleteMany({ where: { userId, type } });
  await prisma.emailToken.create({
    data: {
      tokenHash: createHash("sha256").update(raw).digest("hex"),
      type,
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return raw;
}

// ---------------------------------------------------------------- events

export async function createEventWithTicket(opts: {
  sellerProfileId: string;
  quantity?: number;
  priceCents?: number;
  currency?: string;
  tier?: TicketTier;
  isGroup?: boolean;
  minGroupSize?: number;
  maxGroupSize?: number;
  ticketStartsAt?: Date;
  ticketEndsAt?: Date;
  eventStatus?: EventStatus;
}) {
  const event = await prisma.event.create({
    data: {
      sellerId: opts.sellerProfileId,
      title: "Test Event",
      slug: `test-event-${randomBytes(4).toString("hex")}`,
      description: "A test event used by the automated tests.",
      venue: "Test Venue",
      city: "Nairobi",
      country: "Kenya",
      startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 5 * 60 * 60 * 1000),
      status: opts.eventStatus ?? "PUBLISHED",
    },
  });

  const ticket = await prisma.ticketType.create({
    data: {
      eventId: event.id,
      name: "General",
      tier: opts.tier ?? "REGULAR",
      priceCents: opts.priceCents ?? 100_000, // KES 1,000
      currency: opts.currency ?? "KES",
      quantity: opts.quantity ?? 10,
      isGroup: opts.isGroup ?? false,
      minGroupSize: opts.minGroupSize,
      maxGroupSize: opts.maxGroupSize,
      startsAt: opts.ticketStartsAt,
      endsAt: opts.ticketEndsAt,
    },
  });

  return { event, ticket };
}

// ---------------------------------------------------------------- orders and payments

export const placeOrder = (buyer: AuthUser, items: { ticketTypeId: string; quantity: number }[]) =>
  api().post("/api/v1/orders").set(authHeader(buyer)).send({ items });

export function mockWebhook(body: object, signature = process.env.PAYMENT_WEBHOOK_SECRET ?? "") {
  return api().post("/api/v1/payments/webhook").set("x-payment-signature", signature).send(body);
}

export function payOrder(
  order: { reference: string; totalCents: number; currency: string },
  providerRef = `mock_${randomBytes(4).toString("hex")}`
) {
  return mockWebhook({
    reference: order.reference,
    status: "SUCCEEDED",
    providerRef,
    amountCents: order.totalCents,
    currency: order.currency,
  });
}

// A seller, a published event, a buyer and a PAID order, ready to use.
export async function setupPaidOrder(opts: { quantity?: number; stock?: number; priceCents?: number } = {}) {
  const { user: sellerUser, profile } = await createSeller();
  const { event, ticket } = await createEventWithTicket({
    sellerProfileId: profile.id,
    quantity: opts.stock ?? 5,
    priceCents: opts.priceCents ?? 100_000,
  });
  const buyer = await createUser("USER");

  const created = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: opts.quantity ?? 2 }]);
  if (created.status !== 201) throw new Error(`Could not place the test order: ${created.status} ${created.text}`);

  const order = created.body.data as { id: string; reference: string; totalCents: number; currency: string };
  const paid = await payOrder(order);
  if (paid.status !== 200) throw new Error(`Could not pay the test order: ${paid.status} ${paid.text}`);

  return { sellerUser, profile, event, ticket, buyer, order };
}
// ==========================================
// END OF FILE: backend/tests/helpers.ts
// ==========================================