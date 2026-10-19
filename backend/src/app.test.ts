// New file: backend/src/app.test.ts
// Minimal health endpoint test for the initial scaffold.

import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app.js";
import type { Server } from "node:http";

describe("Ticket Take It API", () => {
  let server: Server;
  let baseUrl: string;

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("exposes a healthy versioned API", async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address.");
    baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/api/v1/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "ticket-take-it-api",
    });
  });
});
