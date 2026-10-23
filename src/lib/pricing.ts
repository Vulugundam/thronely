/**
 * Pricing rules — pure functions, no database access, no `Date.now()`.
 *
 * Every function takes an already-ranked `Board` (best first, rank 1 at index 0)
 * so the rules are deterministic and unit-testable in isolation. The board is
 * always the ALL-TIME board: money is cumulative and permanent, so a claim is
 * inherently an all-time action regardless of which tab is being viewed.
 *
 * All money is integer cents. Whole US dollars only.
 */

/** Minimum cost to put a new product on the board. */
export const MIN_LISTING_CENTS = 500;

/** Extra surcharge for taking the top slot, on top of the leader's price. */
export const TOP_SURCHARGE_CENTS = 500;

/** You must outbid the holder of rank N by this much to take it. */
export const STEP_CENTS = 100;

/** Hard cap on any single Stripe Checkout. */
export const MAX_CHECKOUT_CENTS = 1_000_000;

/** A product as it participates in ranking. */
export type BoardEntry = {
  id: string;
  totalPaidCents: number;
  lastBidAt: Date | string | null;
};

/** A ranked board: index 0 is rank 1. Must already be sorted by `byRank`. */
export type Board = readonly BoardEntry[];

/** The product attempting to claim, or null for a brand new listing. */
export type ClaimProduct = {
  id: string;
  totalPaidCents: number;
} | null;

export type ClaimRejection =
  | "invalid_rank"
  | "already_at_rank"
  | "would_downgrade"
  | "exceeds_max";

export type ClaimQuote =
  | {
      ok: true;
      /** What the buyer is actually charged: the difference. */
      deltaCents: number;
      /** The resulting totalPaidCents that lands them on `targetRank`. */
      targetTotalCents: number;
      /** The cost of the rank itself, before subtracting what they already paid. */
      rankPriceCents: number;
      currentTotalCents: number;
      targetRank: number;
    }
  | {
      ok: false;
      reason: ClaimRejection;
      message: string;
    };

/** Money must always be whole dollars; guards against fractional cents creeping in. */
function assertWholeDollars(cents: number, label: string): void {
  if (!Number.isInteger(cents) || cents % 100 !== 0) {
    throw new Error(`${label} must be whole dollars in integer cents, got ${cents}`);
  }
}

/**
 * The 1-based rank a product currently holds, or null if it is not on the board.
 */
export function currentRankOf(
  productId: string,
  board: Board,
): number | null {
  const index = board.findIndex((entry) => entry.id === productId);
  return index === -1 ? null : index + 1;
}

/**
 * What it costs to occupy `rank`, ignoring what the buyer has already paid.
 *
 * - rank 1 costs the leader's price + the top surcharge (or the listing minimum
 *   when the board is empty).
 * - an occupied rank N costs that holder's price + one step, so the buyer ends up
 *   strictly above them.
 * - an empty slot costs the flat listing minimum, which keeps entering the board
 *   cheap and predictable rather than making deep positions oddly expensive.
 */
export function rankPriceCents(rank: number, board: Board): number {
  if (!Number.isInteger(rank) || rank < 1) {
    throw new Error(`rank must be a positive integer, got ${rank}`);
  }

  if (rank === 1) {
    const leader = board[0];
    const price =
      leader === undefined
        ? MIN_LISTING_CENTS
        : leader.totalPaidCents + TOP_SURCHARGE_CENTS;
    assertWholeDollars(price, "rank 1 price");
    return Math.max(price, MIN_LISTING_CENTS);
  }

  const holder = board[rank - 1];

  // Empty slot: the board has fewer than `rank` products on it.
  if (holder === undefined) return MIN_LISTING_CENTS;

  const price = holder.totalPaidCents + STEP_CENTS;
  assertWholeDollars(price, `rank ${rank} price`);
  return Math.max(price, MIN_LISTING_CENTS);
}

/**
 * The amount to charge a buyer to take `targetRank`.
 *
 * Bids stack: a product that has already paid only pays the difference between
 * the rank's price and its own cumulative total. Paying that delta lands it
 * exactly on `rankPriceCents(targetRank, board)`, which is what "climbing" means.
 */
export function totalToClaim({
  product,
  targetRank,
  board,
}: {
  product: ClaimProduct;
  targetRank: number;
  board: Board;
}): ClaimQuote {
  if (!Number.isInteger(targetRank) || targetRank < 1) {
    return {
      ok: false,
      reason: "invalid_rank",
      message: "Rank must be a whole number of 1 or more.",
    };
  }

  const currentTotalCents = product?.totalPaidCents ?? 0;
  assertWholeDollars(currentTotalCents, "product total");

  const rankPrice = rankPriceCents(targetRank, board);
  const deltaCents = rankPrice - currentTotalCents;

  // Already sitting on the target rank: nothing to buy.
  if (product !== null) {
    const currentRank = currentRankOf(product.id, board);
    if (currentRank === targetRank) {
      return {
        ok: false,
        reason: "already_at_rank",
        message: `You already hold rank ${targetRank}.`,
      };
    }
    // Refuse a downgrade — charging money to move down would be indefensible.
    if (currentRank !== null && targetRank > currentRank) {
      return {
        ok: false,
        reason: "would_downgrade",
        message: `Rank ${targetRank} sits below your current rank ${currentRank}.`,
      };
    }
  }

  // A product holding a rank always has money on the board, so this only bites
  // when the board shifted between quote and checkout.
  if (deltaCents <= 0) {
    return {
      ok: false,
      reason: "would_downgrade",
      message: "Your balance already covers that rank.",
    };
  }

  if (deltaCents > MAX_CHECKOUT_CENTS) {
    return {
      ok: false,
      reason: "exceeds_max",
      message: `A single claim is capped at ${formatUsd(MAX_CHECKOUT_CENTS)}.`,
    };
  }

  assertWholeDollars(deltaCents, "claim delta");

  return {
    ok: true,
    deltaCents,
    targetTotalCents: rankPrice,
    rankPriceCents: rankPrice,
    currentTotalCents,
    targetRank,
  };
}

/**
 * One decimal place is enough: every price is whole dollars by construction, so
 * trailing cents are always `.00`. Kept here (rather than in a React file) so
 * server code, tests and the seed script all format money identically.
 */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
