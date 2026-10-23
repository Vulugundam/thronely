import { prisma } from "./db";
import { markRequestTime } from "./request-time";

/**
 * The public scoreboard line: visitors, money moved, listings, days live.
 *
 * Everything here is aggregate and non-identifying by design — it is a public
 * claim about the site, so it must be derivable from the data we actually hold
 * rather than estimated. Where a number would be a guess, we report the real
 * thing or omit it.
 */

/**
 * When the site launched. Launch date is a fact about the deployment, not a
 * query, so it is configured rather than inferred: the earliest row in the
 * database would drift backwards every time a fixture or a backfill added one.
 */
export const LAUNCH_DATE = new Date(
  process.env.NEXT_PUBLIC_LAUNCH_DATE ?? "2026-01-01T00:00:00.000Z",
);

/** Whole days elapsed since launch, never negative. */
export function daysSinceLaunch(now: Date = new Date()): number {
  const ms = now.getTime() - LAUNCH_DATE.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export type PublicStats = {
  /** Distinct clickers, approximated by distinct IP hashes. */
  visitors: number;
  /** Total money credited to the board, in cents. */
  revenueCents: number;
  listings: number;
  daysLive: number;
};

export async function getPublicStats(): Promise<PublicStats> {
  await markRequestTime();

  const [visitorGroups, revenue, listings] = await Promise.all([
    // Distinct hash values, not rows: one visitor clicking twenty listings is
    // one visitor. Different IPs behind a shared address hash the same, which
    // undercounts slightly — the honest direction to be wrong in for a public
    // number, and the hash is all we keep.
    prisma.click.groupBy({ by: ["ipHash"] }),
    prisma.bid.aggregate({
      where: { status: "paid" },
      _sum: { amountCents: true },
    }),
    prisma.product.count({ where: { hidden: false } }),
  ]);

  return {
    visitors: visitorGroups.length,
    revenueCents: revenue._sum.amountCents ?? 0,
    listings,
    daysLive: daysSinceLaunch(),
  };
}
