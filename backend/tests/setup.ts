// ==========================================
// FILE: backend/tests/setup.ts
// PURPOSE: Points the whole app at the TEST database before anything else loads.
// ==========================================
import { config } from "dotenv";
import { afterAll } from "vitest";

config(); // read backend/.env so we can find TEST_DATABASE_URL

const devUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error("TEST_DATABASE_URL is not set. Create a separate test database and add its URL to backend/.env.");
}
if (testUrl === devUrl) {
  throw new Error("TEST_DATABASE_URL is the same as DATABASE_URL. The tests wipe every table, so this is not allowed.");
}

// The last safety net: the database NAME must contain "test".
const databaseName = new URL(testUrl).pathname.replace(/^\//, "");
if (!/test/i.test(databaseName)) {
  throw new Error(`Refusing to run: the test database is called "${databaseName}". Its name must contain "test".`);
}

process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = "test";

// Predictable settings, whatever is in .env
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-test-access-secret-0001";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-test-refresh-secret-0002";
process.env.BCRYPT_ROUNDS = "10"; // the fastest allowed, so tests stay quick
process.env.REQUIRE_EMAIL_VERIFICATION = "false";
process.env.ENABLE_MOCK_PAYMENTS = "true";
process.env.PAYMENT_WEBHOOK_SECRET = "test_webhook_secret_123456";
process.env.PAYSTACK_SECRET_KEY = "sk_test_vitest_secret_key"; // fake: Paystack calls are mocked in the tests
process.env.RESEND_API_KEY = "";
for (const key of [
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_PASSKEY",
  "MPESA_CALLBACK_SECRET",
  "PUBLIC_API_URL",
]) {
  delete process.env[key];
}

afterAll(async () => {
  const { prisma } = await import("../src/config/database");
  await prisma.$disconnect();
});
// ==========================================
// END OF FILE: backend/tests/setup.ts
// ==========================================