// New file: backend/src/app.ts
// Ticket Take It — Express application configuration.

import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.routes.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/api/v1", (_request, response) => {
  response.status(200).json({
    name: "Ticket Take It API",
    version: "v1",
    status: "available",
  });
});

app.use("/api/v1/health", healthRouter);

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    },
  });
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  // Do not leak stack traces or internal exception details to clients.
  console.error("Unhandled request error", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  if (response.headersSent) return;
  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  });
};

app.use(errorHandler);
