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

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(generalLimiter);

app.get("/health", (_req, res) => res.json({ success: true, status: "API is healthy" }));
app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
// ==========================================
// END OF FILE: backend/src/app.ts
// LOCATION: backend/src/app.ts
// LAST UPDATED: October 19, 2026
// ==========================================