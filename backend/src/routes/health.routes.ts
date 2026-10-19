// New file: backend/src/routes/health.routes.ts
// Health endpoints intentionally expose no secrets or infrastructure credentials.

import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "ticket-take-it-api",
    timestamp: new Date().toISOString(),
  });
});
