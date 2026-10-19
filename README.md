# Ticket Take It

International event discovery and ticketing platform.

## Initial foundation
- Frontend: React, TypeScript, Vite
- Backend: Node.js, TypeScript, Express
- Database: PostgreSQL with Prisma
- Cache/jobs: Redis (introduced in later milestones)
- Testing: Vitest and API integration tests

## Requirements
- Node.js 24 LTS
- npm
- Docker Desktop (recommended for local PostgreSQL and Redis)
- Git

## Start locally
1. Copy `.env.example` to `.env` and set local values.
2. Install dependencies from the repository root:
   ```powershell
   npm install
   ```
3. Start PostgreSQL and Redis:
   ```powershell
   docker compose up -d
   ```
4. Generate Prisma client and apply migrations once the schema is added:
   ```powershell
   npm run db:generate
   npm run db:migrate
   ```
5. Start frontend and backend:
   ```powershell
   npm run dev
   ```

## Scripts
- `npm run dev`: run frontend and backend concurrently
- `npm run build`: build both applications
- `npm run lint`: lint both applications
- `npm run test`: run configured tests
- `npm run typecheck`: type-check both applications

## Security notes
- Never commit `.env` or real provider credentials.
- Payment confirmations must be verified server-side.
- Do not issue tickets based only on a browser redirect.
- Seat availability, prices, permissions and ticket status are server-authoritative.
- Production launch requires security review, provider approval, legal review, monitoring and tested backups.

## Status
Foundation scaffold only. Payment, ticket issuance, QR verification, seat reservation and production authentication are not yet implemented.
