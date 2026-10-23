import { describe, expect, it } from "vitest";
import {
  MAX_CHECKOUT_CENTS,
  MIN_LISTING_CENTS,
  STEP_CENTS,
  TOP_SURCHARGE_CENTS,
  currentRankOf,
  formatUsd,
  rankPriceCents,
  totalToClaim,
} from "@/lib/pricing";
import {
  emptyBoard,
  entry,
  fixtureBoard,
  productAt,
  unpaidProduct,
} from "./fixtures";

describe("pricing constants", () => {
  it("are whole dollars, so no price can introduce fractional cents", () => {
    for (const value of [
      MIN_LISTING_CENTS,
      TOP_SURCHARGE_CENTS,
      STEP_CENTS,
      MAX_CHECKOUT_CENTS,
    ]) {
      expect(value % 100).toBe(0);
    }
  });

  it("set the first-listing minimum equal to the top surcharge", () => {
    // Both being $5 is what makes an empty board cost exactly $5 at rank 1.
    expect(MIN_LISTING_CENTS).toBe(TOP_SURCHARGE_CENTS);
  });
});

describe("rankPriceCents", () => {
  const board = fixtureBoard();

  it("prices rank 1 as the leader plus the top surcharge only", () => {
    // $100 + $5 — the surcharge replaces the $1 step, it is not additive.
    expect(rankPriceCents(1, board)).toBe(10_500);
  });

  it("prices an occupied rank as the holder plus one step", () => {
    expect(rankPriceCents(2, board)).toBe(5_100);
    expect(rankPriceCents(3, board)).toBe(1_100);
  });

  it("prices an empty slot at the flat listing minimum", () => {
    // Deep positions stay cheap and predictable rather than scaling with depth.
    expect(rankPriceCents(4, board)).toBe(MIN_LISTING_CENTS);
    expect(rankPriceCents(50, board)).toBe(MIN_LISTING_CENTS);
  });

  it("prices rank 1 on an empty board at the listing minimum", () => {
    expect(rankPriceCents(1, emptyBoard())).toBe(MIN_LISTING_CENTS);
  });

  it("is 1-based: rank 1 reads board[0], not board[1]", () => {
    // A 0-based bug would price rank 1 off board[1] and yield 600 + 500 = 1,100.
    const board = [
      entry({ id: "top", totalPaidCents: 900 }),
      entry({ id: "second", totalPaidCents: 600 }),
    ];
    expect(rankPriceCents(1, board)).toBe(1_400);
    expect(rankPriceCents(2, board)).toBe(700);
  });

  it("floors an occupied slot at the listing minimum", () => {
    // Unreachable in practice, because every product on the board has paid at
    // least the $5 minimum, so a slot always costs at least $6. The floor is
    // defence in depth against a corrupt or partial board.
    const board = [entry({ id: "dust", totalPaidCents: 100 })];
    expect(rankPriceCents(2, board)).toBe(MIN_LISTING_CENTS);
  });

  it("never returns less than the listing minimum", () => {
    // A holder with no money cannot exist on a real board, but the floor still protects.
    const cheap = [entry({ id: "dust", totalPaidCents: 0 })];
    expect(rankPriceCents(1, cheap)).toBe(MIN_LISTING_CENTS);
    expect(rankPriceCents(2, cheap)).toBe(MIN_LISTING_CENTS);
  });

  it("rejects rank 0, negatives and non-integers", () => {
    for (const rank of [0, -1, 1.5, Number.NaN]) {
      expect(() => rankPriceCents(rank, board)).toThrow();
    }
  });

  it("does not mutate the board", () => {
    const frozen = Object.freeze(fixtureBoard());
    expect(() => rankPriceCents(2, frozen)).not.toThrow();
  });
});

describe("totalToClaim", () => {
  const board = fixtureBoard();

  it("charges a brand-new product the full price of rank 1", () => {
    const quote = totalToClaim({ product: null, targetRank: 1, board });
    expect(quote).toMatchObject({
      ok: true,
      deltaCents: 10_500,
      targetTotalCents: 10_500,
      currentTotalCents: 0,
    });
  });

  it("treats a product with no money as brand new", () => {
    const asNew = totalToClaim({ product: unpaidProduct(), targetRank: 1, board });
    const asNull = totalToClaim({ product: null, targetRank: 1, board });
    expect(asNew).toEqual(asNull);
  });

  it("charges an existing product only the difference when climbing", () => {
    // Charlie holds $10 at rank 3; rank 2 costs $51, so it pays $41.
    const quote = totalToClaim({
      product: productAt("charlie", 1_000),
      targetRank: 2,
      board,
    });
    expect(quote).toMatchObject({ ok: true, deltaCents: 4_100, targetTotalCents: 5_100 });
  });

  it("stacks: the delta lands the product exactly on the rank price", () => {
    // This is the core invariant of stacking — post-payment total equals the
    // quoted slot price, which is what makes "climbing" well defined.
    const cases = [
      { product: productAt("charlie", 1_000), targetRank: 1 },
      { product: productAt("charlie", 1_000), targetRank: 2 },
      { product: productAt("bravo", 5_000), targetRank: 1 },
      { product: productAt("small", 200), targetRank: 6 },
    ];
    for (const { product, targetRank } of cases) {
      const quote = totalToClaim({ product, targetRank, board });
      expect(quote.ok).toBe(true);
      if (!quote.ok) continue;
      expect(quote.currentTotalCents + quote.deltaCents).toBe(quote.targetTotalCents);
      expect(quote.targetTotalCents).toBe(rankPriceCents(targetRank, board));
    }
  });

  it("refuses a rank the product already holds", () => {
    const quote = totalToClaim({
      product: productAt("alpha", 10_000),
      targetRank: 1,
      board,
    });
    expect(quote).toMatchObject({ ok: false, reason: "already_at_rank" });
  });

  it("refuses claiming a lower rank than the one held", () => {
    // Paying money to move DOWN can never help the buyer, so it is refused.
    const quote = totalToClaim({
      product: productAt("alpha", 10_000),
      targetRank: 3,
      board,
    });
    expect(quote).toMatchObject({ ok: false, reason: "would_downgrade" });
  });

  it("allows an upgrade from a lower rank", () => {
    // $105 to hold rank 1, less the $10 Charlie already paid.
    const quote = totalToClaim({
      product: productAt("charlie", 1_000),
      targetRank: 1,
      board,
    });
    expect(quote).toMatchObject({ ok: true, deltaCents: 9_500 });
  });

  it("refuses a claim whose difference has gone non-positive", () => {
    // Reachable only when the board shifted between quote and checkout: the
    // product now holds more money than the target slot costs.
    const moved = [
      entry({ id: "upstart", totalPaidCents: 900 }),
      entry({ id: "bravo", totalPaidCents: 500 }),
    ];
    const quote = totalToClaim({
      product: productAt("upstart", 900),
      targetRank: 2,
      board: moved,
    });
    expect(quote).toMatchObject({ ok: false, reason: "would_downgrade" });
  });

  it("charges the minimum for an empty slot", () => {
    const quote = totalToClaim({ product: null, targetRank: 7, board });
    expect(quote).toMatchObject({ ok: true, deltaCents: MIN_LISTING_CENTS });
  });

  it("subtracts an existing balance from an empty slot's price", () => {
    // Empty slot is $5; a product with $2 already paid owes $3.
    const quote = totalToClaim({
      product: productAt("small", 200),
      targetRank: 9,
      board,
    });
    expect(quote).toMatchObject({ ok: true, deltaCents: 300 });
  });

  it("rejects an invalid target rank", () => {
    for (const rank of [0, -3, 2.5]) {
      expect(totalToClaim({ product: null, targetRank: rank, board })).toMatchObject({
        ok: false,
        reason: "invalid_rank",
      });
    }
  });

  it("caps a single checkout at the maximum, measured on the amount charged", () => {
    const whale = [entry({ id: "whale", totalPaidCents: 5_000_000 })];
    const quote = totalToClaim({ product: null, targetRank: 1, board: whale });
    expect(quote).toMatchObject({ ok: false, reason: "exceeds_max" });
  });

  it("applies the cap to the difference, not to the rank price", () => {
    // A dear board is fine to climb as long as the step itself is affordable.
    const dear = [entry({ id: "leader", totalPaidCents: 2_000_000 })];
    const quote = totalToClaim({
      product: productAt("climber", 1_999_500),
      targetRank: 1,
      board: dear,
    });
    expect(quote).toMatchObject({ ok: true, deltaCents: 1_000 });
  });

  it("always quotes a whole-dollar amount", () => {
    const amounts = [
      totalToClaim({ product: null, targetRank: 1, board }),
      totalToClaim({ product: productAt("charlie", 1_000), targetRank: 2, board }),
      totalToClaim({ product: productAt("small", 200), targetRank: 9, board }),
    ];
    for (const quote of amounts) {
      expect(quote.ok).toBe(true);
      if (quote.ok) expect(quote.deltaCents % 100).toBe(0);
    }
  });

  it("rejects a fractional balance rather than silently rounding", () => {
    expect(() =>
      totalToClaim({
        product: productAt("odd", 1_050),
        targetRank: 1,
        board,
      }),
    ).toThrow(/whole dollars/);
  });

  it("does not mutate the board", () => {
    const frozen = Object.freeze(fixtureBoard());
    expect(() => totalToClaim({ product: null, targetRank: 2, board: frozen })).not.toThrow();
  });
});

describe("currentRankOf", () => {
  const board = fixtureBoard();

  it("returns the 1-based rank of a product on the board", () => {
    expect(currentRankOf("alpha", board)).toBe(1);
    expect(currentRankOf("bravo", board)).toBe(2);
    expect(currentRankOf("charlie", board)).toBe(3);
  });

  it("returns null for a product that is not on the board", () => {
    expect(currentRankOf("ghost", board)).toBeNull();
  });
});

describe("formatUsd", () => {
  it("formats whole dollars without cents", () => {
    expect(formatUsd(500)).toBe("$5");
    expect(formatUsd(10_500)).toBe("$105");
    expect(formatUsd(1_000_000)).toBe("$10,000");
  });
});
