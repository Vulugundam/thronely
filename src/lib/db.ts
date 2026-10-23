import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 dropped the bundled Rust query engine — the client now talks to the
 * database through an explicit driver adapter, so an adapter is required rather
 * than optional. That is also why both drivers are imported here: this file is
 * the single place the provider is chosen, and the branch below is the whole
 * SQLite → Postgres swap.
 *
 * To move to Postgres:
 *   1. prisma/schema.prisma  datasource provider = "postgresql"
 *   2. DATABASE_URL=postgresql://...
 *   3. npm run db:migrate    (regenerates migrations for the new provider)
 * No application code changes.
 */
function createAdapter(url: string) {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return new PrismaPg({ connectionString: url });
  }
  return new PrismaBetterSqlite3({ url });
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env, then run `npm run db:migrate`.",
    );
  }

  const log =
    process.env.NODE_ENV === "development"
      ? (["warn", "error"] as const)
      : (["error"] as const);

  return new PrismaClient({ adapter: createAdapter(url), log: [...log] });
}

// Next.js dev-mode hot reloading re-evaluates modules on every edit, which would
// otherwise open a new connection each time. Cache on globalThis outside prod.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
