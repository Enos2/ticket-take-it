// ==========================================
// FILE: backend/vitest.config.ts
// PURPOSE: Test runner configuration.
// ==========================================
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    fileParallelism: false, // every test file shares one database, so they run one after another
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
// ==========================================
// END OF FILE: backend/vitest.config.ts
// ==========================================