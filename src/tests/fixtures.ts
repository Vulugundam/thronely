import type { Board, BoardEntry } from "@/lib/pricing";

/**
 * Shared test fixtures. Products are declared in descending money order unless a
 * test deliberately shuffles them, so a fixture reads like the board it models.
 */

let counter = 0;

export function entry(
  overrides: Partial<BoardEntry> & { totalPaidCents: number },
): BoardEntry {
  counter += 1;
  return {
    id: overrides.id ?? `p${String(counter).padStart(3, "0")}`,
    totalPaidCents: overrides.totalPaidCents,
    lastBidAt:
      overrides.lastBidAt !== undefined
        ? overrides.lastBidAt
        : new Date(Date.UTC(2026, 0, 1, 0, 0, counter)),
  };
}

/**
 * The canonical fixture used across the pricing tests.
 *
 *   rank 1  Alpha    $100
 *   rank 2  Bravo    $50
 *   rank 3  Charlie  $10
 *
 * Derived slot prices: rank 1 = $105, rank 2 = $51, rank 3 = $11,
 * rank 4 and beyond (empty slot) = $5.
 */
export function fixtureBoard(): Board {
  return [
    entry({ id: "alpha", totalPaidCents: 10_000 }),
    entry({ id: "bravo", totalPaidCents: 5_000 }),
    entry({ id: "charlie", totalPaidCents: 1_000 }),
  ];
}

export function emptyBoard(): Board {
  return [];
}

/** A product that exists but has never paid, so it is not on the board. */
export function unpaidProduct(id = "newco") {
  return { id, totalPaidCents: 0 };
}

export function productAt(id: string, totalPaidCents: number) {
  return { id, totalPaidCents };
}
