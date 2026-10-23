/**
 * The single ranking comparator. Used by the board queries, the pricing module
 * and the tests, so the ordering can never drift between them.
 *
 * Rank = totalPaidCents descending (more money ranks higher).
 * Tie  = earlier lastBidAt first (whoever got there first keeps the slot).
 * Final tie = id ascending, purely to make the order total and deterministic.
 *
 * The third key matters: two products can share both a money total and a
 * timestamp. Without a total order, Postgres/SQLite may return them in different
 * orders for different queries, and offset pagination can then drop or duplicate
 * a row across pages.
 */

import type { BoardEntry } from "./pricing";

/** Products that have never been bid on sort last within their money tier. */
function bidTime(entry: BoardEntry): number {
  if (entry.lastBidAt === null) return Number.POSITIVE_INFINITY;
  const time =
    entry.lastBidAt instanceof Date
      ? entry.lastBidAt.getTime()
      : new Date(entry.lastBidAt).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/** Comparator for `Array.prototype.sort`; negative means `a` ranks higher. */
export function byRank(a: BoardEntry, b: BoardEntry): number {
  if (a.totalPaidCents !== b.totalPaidCents) {
    return b.totalPaidCents - a.totalPaidCents;
  }

  const aTime = bidTime(a);
  const bTime = bidTime(b);
  // Explicit comparison, because Infinity - Infinity is NaN.
  if (aTime !== bTime) return aTime < bTime ? -1 : 1;

  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Convenience: a sorted copy, leaving the input untouched. */
export function sortBoard<T extends BoardEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(byRank);
}

/**
 * The SQL `ORDER BY` that mirrors `byRank` exactly. Kept beside the comparator
 * so the two are read together, and asserted equal in the ranking tests.
 */
export const BOARD_ORDER_BY = [
  { totalPaidCents: "desc" as const },
  { lastBidAt: "asc" as const },
  { id: "asc" as const },
];
