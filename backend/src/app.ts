// ==========================================
// FILE: backend/src/app.ts
// PURPOSE: Sets up Express with security headers and CORS.
// ==========================================
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { generalLimiter } from "./middleware/rateLimit.middleware";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware";
import routes from "./routes/index";

const app = express();

// Behind Render's proxy, trust one hop so req.ip is the real client IP.
// Rate limiting depends on this. If limits seem shared between users, check the hop count.
if (env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(helmet());

// CORS_ORIGIN may hold several origins, comma-separated.
const allowedOrigins = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Health check sits before logging and rate limiting so uptime pings
// don't flood the logs or use up the request limit.
app.get("/health", (_req, res) => res.json({ success: true, status: "API is healthy" }));

app.use(pinoHttp({ logger }));
app.use(generalLimiter);

// NOTE: Stripe webhooks need the raw body. When you add them, mount
// express.raw({ type: "application/json" }) for that route BEFORE this line.
app.use(express.json({ limit: "100kb" }));

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
// ==========================================
// END OF FILE: backend/src/app.ts
// ==========================================