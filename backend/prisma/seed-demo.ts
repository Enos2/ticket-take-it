// ==========================================
// FILE: backend/prisma/seed-demo.ts
// PURPOSE: Creates a demo seller and sample published events for development.
// ==========================================
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number, extraHours = 0) => new Date(Date.now() + days * DAY + extraHours * 60 * 60 * 1000);

// Development-only login for the demo seller. Never create this account on a deployed database.
const SELLER_EMAIL = "seller@demo.tickettakeit.dev";
const SELLER_PASSWORD = "DemoSeller123!";

interface DemoEvent {
  slug: string;
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: Date;
  endsAt: Date;
  tickets: Prisma.TicketTypeCreateWithoutEventInput[];
}

const EVENTS: DemoEvent[] = [
  {
    slug: "demo-nairobi-jazz-night",
    title: "Nairobi Jazz Night",
    description:
      "An evening of live jazz under the stars, with three bands and a resident saxophonist.\n\nGates open at 6 PM. Food and drinks are sold on site.",
    venue: "Garden Courtyard",
    city: "Nairobi",
    startsAt: inDays(10, 18),
    endsAt: inDays(10, 23),
    tickets: [
      {
        name: "Early bird",
        tier: "EARLY_BIRD",
        priceCents: 150_000,
        currency: "KES",
        quantity: 50,
        startsAt: inDays(-1),
        endsAt: inDays(5),
        description: "The lowest price, for a limited time.",
      },
      { name: "Regular", tier: "REGULAR", priceCents: 250_000, currency: "KES", quantity: 200 },
      {
        name: "VIP table",
        tier: "VIP",
        priceCents: 600_000,
        currency: "KES",
        quantity: 30,
        description: "Reserved seating close to the stage and a welcome drink.",
      },
    ],
  },
  {
    slug: "demo-community-charity-run",
    title: "Community Charity Run 5K",
    description:
      "A friendly 5 kilometre run and walk that raises money for local school meals.\n\nEntry is free for individuals. Bring friends: groups of four to eight register together.",
    venue: "City Park Grounds",
    city: "Nairobi",
    startsAt: inDays(14, 7),
    endsAt: inDays(14, 11),
    tickets: [
      { name: "Free entry", tier: "REGULAR", priceCents: 0, currency: "KES", quantity: 100 },
      {
        name: "Friends group",
        tier: "GROUP",
        priceCents: 80_000,
        currency: "KES",
        quantity: 80,
        isGroup: true,
        minGroupSize: 4,
        maxGroupSize: 8,
        description: "Four to eight people register together and get matching T-shirts.",
      },
    ],
  },
  {
    slug: "demo-coastal-beats-festival",
    title: "Coastal Beats Festival",
    description:
      "Two stages, sunset sets and the best of coastal music, right on the beach.\n\nGates open at noon. Kids under 12 enter free with an adult.",
    venue: "Beachfront Arena",
    city: "Mombasa",
    startsAt: inDays(30, 12),
    endsAt: inDays(30, 23),
    tickets: [
      { name: "General admission", tier: "REGULAR", priceCents: 300_000, currency: "KES", quantity: 500 },
      {
        name: "Backstage pass",
        tier: "VIP",
        priceCents: 1_200_000,
        currency: "KES",
        quantity: 5,
        description: "Meet the artists. Very limited.",
      },
    ],
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo data is for development only. Refusing to run in production.");
  }

  const existing = await prisma.event.count({ where: { slug: { startsWith: "demo-" } } });
  if (existing > 0) {
    console.log("Demo events already exist. Nothing to do.");
    return;
  }

  const user = await prisma.user.upsert({
    where: { email: SELLER_EMAIL },
    update: {},
    create: {
      email: SELLER_EMAIL,
      fullName: "Demo Seller",
      passwordHash: await bcrypt.hash(SELLER_PASSWORD, 10),
      role: "SELLER",
      emailVerified: true,
    },
  });

  const seller = await prisma.sellerProfile.upsert({
    where: { userId: user.id },
    update: { status: "APPROVED" },
    create: {
      userId: user.id,
      businessName: "Demo Events Ltd",
      businessEmail: SELLER_EMAIL,
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });

  for (const event of EVENTS) {
    await prisma.event.create({
      data: {
        sellerId: seller.id,
        slug: event.slug,
        title: event.title,
        description: event.description,
        venue: event.venue,
        city: event.city,
        country: "Kenya",
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        status: "PUBLISHED",
        ticketTypes: { create: event.tickets },
      },
    });
    console.log(`Created: ${event.title}`);
  }

  console.log(`\nDemo seller login (development only): ${SELLER_EMAIL} / ${SELLER_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
// ==========================================
// END OF FILE: backend/prisma/seed-demo.ts
// ==========================================