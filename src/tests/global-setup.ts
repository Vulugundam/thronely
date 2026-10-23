import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A database of its own for the suite.
 *
 * The tests that matter here — the ones that credit money — write to `Product` and
 * `Bid`, and they must not do it to `prisma/dev.db`. The dev database is a seeded
 * demo board; incrementing `totalPaidCents` on a real listing would leave the
 * demo showing wrong ranks after every test run, and the seed's own invariant
 * checks (and its visible output) depend on that board being coherent.
 *
 * `prisma migrate deploy` against a fresh file is non-destructive: it applies the
 * committed migrations and never touches anything else. `migrate reset` would be
 * the obvious tool and is deliberately not used — the dev board is not something
 * a test run gets to discard.
 *
 * The file is removed before and after rather than truncated, so a crashed run
 * cannot leave a half-migrated database behind for the next one to trip over. The
 * `-journal`/`-wal`/`-shm` sidecars are SQLite's, and leaving them would risk a
 * stale journal resurrecting rows that were meant to be gone.
 */

const TEST_DB = "prisma/test.db";

/** Every file SQLite may create alongside the database itself. */
const SIDECARS = ["", "-journal", "-wal", "-shm"] as const;

function removeTestDb() {
  for (const suffix of SIDECARS) {
    rmSync(resolve(process.cwd(), `${TEST_DB}${suffix}`), { force: true });
  }
}

export default function setup() {
  removeTestDb();

  execFileSync(
    "npx",
    ["prisma", "migrate", "deploy", "--config", "prisma7.config.ts"],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: `file:./${TEST_DB}` },
    },
  );

  return () => {
    removeTestDb();
  };
}
