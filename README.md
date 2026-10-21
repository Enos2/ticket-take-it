<div align="center">

<img src="./TTI-void.jpg" alt="Ticket Take It logo" width="220" />

# Ticket Take It

**Your World. Your Moment.**

A secure, high-performance event ticketing platform built for early-bird releases, group bookings and seamless payments.

<br />

![Node.js](https://img.shields.io/badge/Node.js-20+-0B0B0D?style=for-the-badge&logo=nodedotjs&logoColor=C9A45C)
![TypeScript](https://img.shields.io/badge/TypeScript-5-0B0B0D?style=for-the-badge&logo=typescript&logoColor=C9A45C)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-0B0B0D?style=for-the-badge&logo=postgresql&logoColor=C9A45C)
![Prisma](https://img.shields.io/badge/Prisma-ORM-0B0B0D?style=for-the-badge&logo=prisma&logoColor=C9A45C)
![React](https://img.shields.io/badge/React-Vite-0B0B0D?style=for-the-badge&logo=react&logoColor=E32636)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-0B0B0D?style=for-the-badge&logo=tailwindcss&logoColor=E32636)

[Overview](#overview) · [Features](#features) · [Tech Stack](#tech-stack) · [Security](#security) · [Schema](#database-schema) · [API](#api-reference) · [Setup](#getting-started) · [Design](#design-system) · [Roadmap](#roadmap)

</div>

---

## Overview

Ticket Take It solves three problems common in event ticketing: **overselling**, **clumsy group bookings**, and **insecure payment handling**.

The platform serves three roles:

| Role | Who | What they can do |
| :--- | :--- | :--- |
| **Buyer** (`USER`) | Event-goers | Browse events, buy Early Bird or Group tickets, view their own orders |
| **Seller** (`SELLER`) | Event organizers | Create events, manage ticket inventory, view sales for their events |
| **Admin** (`ADMIN`) | Platform operators | Full oversight: approve sellers, manage all users and events |

---

## Features

### Ticket Engine

Complex ticket rules are enforced natively in the database layer.

| Ticket Type | Controlled By | Rule |
| :--- | :--- | :--- |
| **Early Bird** | `startsAt`, `endsAt` | Purchases outside the window fail immediately |
| **Group** | `minGroupSize`, `maxGroupSize` | Buying 2 tickets on a tier with a minimum of 5 fails |
| **VIP** | `price`, `quantity` | Standard tier with its own inventory |

### Overselling Protection

Orders run inside a Prisma `$transaction` (ACID). On purchase, the database locks the ticket row, checks `sold` against `quantity`, then increments it. If two buyers grab the last ticket at the same instant, one succeeds and the other receives an error.

```mermaid
sequenceDiagram
    participant A as Buyer A
    participant B as Buyer B
    participant API as Orders API
    participant DB as PostgreSQL

    A->>API: POST /orders (last ticket)
    B->>API: POST /orders (last ticket)
    API->>DB: BEGIN, lock ticket row (A)
    DB-->>API: sold < quantity, increment
    API-->>A: 201 Order created
    API->>DB: BEGIN, lock ticket row (B)
    DB-->>API: sold = quantity
    API-->>B: 409 Sold out
```

### Payments and Webhooks

- **Providers:** Stripe and M-Pesa via the `payments` module.
- **Webhook security:** webhooks require an `x-payment-signature` header. Unsigned requests that try to mark an order `PAID` are rejected with `401 Unauthorized`.
- **Idempotency:** a duplicate `SUCCEEDED` webhook is ignored, preventing double-crediting.

### Role-Based Access Control

| Role | Access |
| :--- | :--- |
| `USER` | View events and own orders only |
| `SELLER` | Must be onboarded. Create events, view orders for their own events |
| `ADMIN` | `/api/v1/admin` endpoints: view all users, approve sellers, manage the platform |

---

## Tech Stack

### Backend

| Layer | Technology |
| :--- | :--- |
| Runtime | Node.js v20+ |
| Framework | Express.js (TypeScript) |
| Database | PostgreSQL (hosted on Neon) |
| ORM | Prisma |
| Validation | Zod |
| Security | JWT, bcrypt, Helmet, express-rate-limit |

### Frontend (UI overhaul pending)

| Layer | Technology |
| :--- | :--- |
| Framework | React (TypeScript) + Vite |
| Auth state | Zustand |
| Server state | TanStack React Query |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React (SVG only, no emojis) |
| Routing | React Router v6 |

---

## Security

Defense in depth, built for production.

| # | Layer | Implementation |
| :-: | :--- | :--- |
| 1 | **Password hashing** | `bcrypt` with cost factor 12 |
| 2 | **Token rotation** | Access tokens (15m) plus revocable refresh tokens (7d) stored in the database |
| 3 | **Strict validation** | Every body, query and param validated with `zod`; unknown keys stripped to block mass assignment |
| 4 | **Rate limiting** | General API: 300 req / 15 min. Auth endpoints: 10 req / 15 min (brute-force protection) |
| 5 | **HTTP headers** | `helmet` hides `X-Powered-By` and sets a secure CSP |
| 6 | **CORS** | Locked to the frontend URL only |

---

## Database Schema

```mermaid
erDiagram
    User ||--o{ RefreshToken : has
    User ||--o| SellerProfile : "becomes"
    SellerProfile ||--o{ Event : creates
    Event ||--o{ TicketType : offers
    User ||--o{ Order : places
    Order ||--o{ OrderItem : contains
    TicketType ||--o{ OrderItem : "sold as"
    Order ||--o{ Payment : "paid by"
```

| Model | Purpose |
| :--- | :--- |
| `User` | Auth data, role and profile info |
| `RefreshToken` | Hashed refresh tokens for session management |
| `SellerProfile` | Linked to `User`. Business details, status (`PENDING`, `APPROVED`), payout info |
| `Event` | Created by a seller. Title, venue, dates and a unique SEO-friendly `slug` |
| `TicketType` | The core table. Price, quantity, sold count, tier (`EARLY_BIRD`, `GROUP`, `VIP`), early-bird dates, group limits |
| `Order` | Links a user to a purchase. Total, status (`PENDING`, `PAID`, `CANCELLED`) and unique reference |
| `OrderItem` | Order line items: ticket type, quantity, subtotal |
| `Payment` | Stripe / M-Pesa transactions, provider references and statuses |

---

## API Reference

Base URL: `/api/v1`

### Auth `/auth`

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/register` | Create a new user | Public |
| `POST` | `/login` | Authenticate, receive access and refresh tokens | Public |
| `POST` | `/refresh` | Rotate access tokens | Public |
| `POST` | `/logout` | Revoke refresh token | Public |

### Users `/users`

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/me` | Get current user profile | Authenticated |

### Sellers `/sellers`

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/onboard` | Become a seller (upgrades role) | Authenticated |
| `GET` | `/orders` | View orders for the seller's events | Seller, Admin |

### Events `/events`

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | List all published events | Public |
| `POST` | `/` | Create an event | Seller, Admin |

### Tickets `/events/:eventId/tickets`

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Get all tickets for an event | Public |
| `POST` | `/` | Create a ticket type | Seller, Admin |

### Orders `/orders`

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Create an order (transactional inventory) | Authenticated |
| `GET` | `/my-orders` | List the current user's orders | Authenticated |

### Payments `/payments`

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/initialize/:orderId` | Get a payment intent | Authenticated |
| `POST` | `/webhook` | Stripe / M-Pesa webhook | Public, signature required |

### Admin `/admin`

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/users` | List all users | Admin |
| `GET` | `/sellers` | List all sellers | Admin |
| `PATCH` | `/sellers/:id/status` | Approve or reject a seller | Admin |

---

## Getting Started

### Prerequisites

- Node.js v20+
- A PostgreSQL database ([Neon](https://neon.tech) recommended)

### 1. Install the backend

```bash
cd backend
npm install
```

### 2. Configure environment variables

Create a `.env` file in the `backend` folder:

```env
NODE_ENV=development
PORT=5000
CORS_ORIGIN=http://localhost:5173

DATABASE_URL="postgresql://user:password@your-neon-url.com/neondb?sslmode=require"

JWT_ACCESS_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
BCRYPT_ROUNDS=12
PAYMENT_WEBHOOK_SECRET=mock_signature_123
```

> **Warning:** the values above are placeholders for local development. Generate long, random secrets for every deployed environment and never commit your `.env` file.

### 3. Set up and seed the database

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run seed
```

The seed creates an admin account:

| Field | Value |
| :--- | :--- |
| Email | `admin@tickettakeit.com` |
| Password | `AdminPassword123!` |

> **Warning:** development credentials only. Change or remove this account before going live.

### 4. Start the backend

```bash
npm run dev
```

The API runs at **http://localhost:5000**.

### 5. Start the frontend (if resuming the UI build)

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

The app runs at **http://localhost:5173**.

---

## Design System

The UI follows a premium, cinematic look. Stick to this palette.

| Swatch | Name | Hex | Usage |
| :---: | :--- | :--- | :--- |
| ![#0B0B0D](https://placehold.co/24x24/0B0B0D/0B0B0D.png) | Deep Black | `#0B0B0D` | Main page background |
| ![#18181B](https://placehold.co/24x24/18181B/18181B.png) | Charcoal | `#18181B` | Cards, panels, secondary sections |
| ![#E32636](https://placehold.co/24x24/E32636/E32636.png) | Cinematic Red | `#E32636` | Primary buttons, active links, key actions |
| ![#C9A45C](https://placehold.co/24x24/C9A45C/C9A45C.png) | Muted Gold | `#C9A45C` | Premium labels, subtle borders, icons |
| ![#F5F5F5](https://placehold.co/24x24/F5F5F5/F5F5F5.png) | Off-white | `#F5F5F5` | Main text |
| ![#A1A1AA](https://placehold.co/24x24/A1A1AA/A1A1AA.png) | Muted Gray | `#A1A1AA` | Secondary text |

### Logos

| Asset | Use |
| :--- | :--- |
| `logo-icon.png` | Favicon and hero image (the TTI Void graphic) |
| `logo-full.png` | Navbar (graphic with text) |

### UI Rules

- **No emojis.** Use `lucide-react` SVG icons exclusively.
- **Layout:** high contrast, bento-box grids, clean typography (Inter or system sans-serif).

---

## Roadmap

- [ ] **QR code tickets:** generate scannable tickets from order references with `qrcode.react`
- [ ] **Email notifications:** send ticket PDFs on successful payment via Resend or SendGrid
- [ ] **Frontend polish:** finish the React UI so the Admin, Seller and Buyer dashboards match the design system
- [ ] **Real payments:** replace the mock webhook with Stripe Elements and the M-Pesa Daraja API

---

<div align="center">

**Ticket Take It** · Your World. Your Moment.

</div>