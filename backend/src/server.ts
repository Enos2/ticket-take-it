// New file: backend/src/server.ts
// Ticket Take It — API entry point.

import { app } from "./app.js";
import { env } from "./config/env.js";

const server = app.listen(env.API_PORT, () => {
  console.info(`Ticket Take It API listening on port ${env.API_PORT}`);
});

const shutdown = (signal: string) => {
  console.info(`Received ${signal}; shutting down gracefully.`);
  server.close((error) => {
    if (error) {
      console.error("Server shutdown failed.");
      process.exitCode = 1;
      return;
    }
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
