import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    // The webhook tests share one SQLite file, and SQLite allows a single
    // writer. Running files in parallel would surface as lock contention
    // rather than as the behaviour under test.
    fileParallelism: false,
    // Builds a separate prisma/test.db so the money tests never touch the seeded
    // dev board. See the module comment for why it is not db:reset.
    globalSetup: ["src/tests/global-setup.ts"],
    /*
     * Set before any test file is imported, which matters because `src/lib/db.ts`
     * reads DATABASE_URL once at module evaluation and caches the client on
     * globalThis. Getting this wrong would silently point the suite at dev.db.
     *
     * The webhook secret is pinned so verification does not depend on whatever is
     * in the developer's .env, and NODE_ENV is "test" so the dev-only branches
     * (the mock checkout, the development signing secret) behave as they do in
     * development rather than as they do in production.
     */
    env: {
      DATABASE_URL: "file:./prisma/test.db",
      STRIPE_WEBHOOK_SECRET: "whsec_test_suite",
      NODE_ENV: "test",
    },
  },
});
