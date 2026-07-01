import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Integration tests only — real Postgres via `TEST_DATABASE_URL`. Run with
 * `npm run test:integration`. Separate from the default (unit) config so the
 * fast, DB-free suite and the DB-backed suite never entangle.
 */
export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Populate TEST_DATABASE_URL from .env/.env.test before the harness reads it.
    setupFiles: ["./vitest.integration.setup.ts"],
    // A shared database is mutated per file; run files serially so concurrent
    // writers don't fight over the truncate/reset.
    fileParallelism: false,
    // These queries hit the network (Neon); give them room beyond the default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
