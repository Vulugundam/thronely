import { describe, expect, it } from "vitest";
import { byRank, sortBoard } from "@/lib/ranking";
import type { BoardEntry } from "@/lib/pricing";
import { entry } from "./fixtures";

const t = (iso: string) => new Date(iso);

describe("byRank", () => {
  it("ranks by money descending", () => {
    const board = sortBoard([
      entry({ id: "small", totalPaidCents: 100 }),
      entry({ id: "big", totalPaidCents: 900 }),
      entry({ id: "mid", totalPaidCents: 500 }),
    ]);
    expect(board.map((b) => b.id)).toEqual(["big", "mid", "small"]);
  });

  it("breaks a money tie in favour of the earlier bid", () => {
    const board = sortBoard([
      entry({ id: "late", totalPaidCents: 500, lastBidAt: t("2026-01-02T00:00:00Z") }),
      entry({ id: "early", totalPaidCents: 500, lastBidAt: t("2026-01-01T00:00:00Z") }),
    ]);
    expect(board.map((b) => b.id)).toEqual(["early", "late"]);
  });

  it("falls back to id when money and time are both tied", () => {
    // Two $10 bids in the same second collide exactly, because Stripe event
    // timestamps are second-granular. Without this key the order is undefined
    // and offset pagination can drop or duplicate rows.
    const same = t("2026-01-01T00:00:00Z");
    const board = sortBoard([
      entry({ id: "charlie", totalPaidCents: 500, lastBidAt: same }),
      entry({ id: "alpha", totalPaidCents: 500, lastBidAt: same }),
      entry({ id: "bravo", totalPaidCents: 500, lastBidAt: same }),
    ]);
    expect(board.map((b) => b.id)).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("is a total order: distinct entries never compare equal", () => {
    const same = t("2026-01-01T00:00:00Z");
    const board: BoardEntry[] = [
      entry({ id: "a", totalPaidCents: 500, lastBidAt: same }),
      entry({ id: "b", totalPaidCents: 500, lastBidAt: same }),
      entry({ id: "c", totalPaidCents: 500, lastBidAt: same }),
    ];
    for (const x of board) {
      for (const y of board) {
        if (x.id === y.id) {
          expect(byRank(x, y)).toBe(0);
        } else {
          expect(byRank(x, y)).not.toBe(0);
        }
      }
    }
  });

  it("is antisymmetric and transitive", () => {
    const board = sortBoard([
      entry({ id: "a", totalPaidCents: 100 }),
      entry({ id: "b", totalPaidCents: 300 }),
      entry({ id: "c", totalPaidCents: 300 }),
      entry({ id: "d", totalPaidCents: 200 }),
    ]);
    // `+ 0` normalises -0 to 0, which Object.is would otherwise distinguish.
    const sign = (n: number) => Math.sign(n) + 0;
    for (const x of board) {
      for (const y of board) {
        expect(sign(byRank(x, y))).toBe(sign(-sign(byRank(y, x))));
      }
    }
    for (const x of board) {
      for (const y of board) {
        for (const z of board) {
          if (byRank(x, y) < 0 && byRank(y, z) < 0) {
            expect(byRank(x, z)).toBeLessThan(0);
          }
        }
      }
    }
  });

  it("is order-independent: the same set sorts the same from any input order", () => {
    const make = (): BoardEntry[] => [
      entry({ id: "a", totalPaidCents: 300, lastBidAt: t("2026-01-03T00:00:00Z") }),
      entry({ id: "b", totalPaidCents: 300, lastBidAt: t("2026-01-01T00:00:00Z") }),
      entry({ id: "c", totalPaidCents: 300, lastBidAt: t("2026-01-01T00:00:00Z") }),
      entry({ id: "d", totalPaidCents: 900, lastBidAt: null }),
      entry({ id: "e", totalPaidCents: 100, lastBidAt: t("2026-01-02T00:00:00Z") }),
    ];
    const forward = sortBoard(make()).map((x) => x.id);
    const reversed = sortBoard(make().reverse()).map((x) => x.id);
    expect(forward).toEqual(reversed);
  });

  it("sorts entries that were never bid on last within their money tier", () => {
    const board = sortBoard([
      entry({ id: "never", totalPaidCents: 500, lastBidAt: null }),
      entry({ id: "bid", totalPaidCents: 500, lastBidAt: t("2026-01-05T00:00:00Z") }),
    ]);
    expect(board.map((b) => b.id)).toEqual(["bid", "never"]);
  });

  it("accepts ISO strings as well as Date objects", () => {
    const board = sortBoard([
      entry({ id: "late", totalPaidCents: 500, lastBidAt: "2026-01-02T00:00:00Z" }),
      entry({ id: "early", totalPaidCents: 500, lastBidAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(board.map((b) => b.id)).toEqual(["early", "late"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      entry({ id: "a", totalPaidCents: 100 }),
      entry({ id: "b", totalPaidCents: 900 }),
    ];
    const ids = input.map((x) => x.id);
    sortBoard(input);
    expect(input.map((x) => x.id)).toEqual(ids);
  });
});

describe("pagination stability", () => {
  it("concatenates pages with no gaps or duplicates", () => {
    const same = t("2026-01-01T00:00:00Z");
    // A pathological board: every row shares money AND time, so only the id
    // tiebreak keeps the order total.
    const board = sortBoard(
      Array.from({ length: 57 }, (_, i) =>
        entry({
          id: `p${String(i).padStart(3, "0")}`,
          totalPaidCents: 500,
          lastBidAt: same,
        }),
      ),
    );

    const pageSize = 10;
    const pages: string[][] = [];
    for (let offset = 0; offset < board.length; offset += pageSize) {
      pages.push(board.slice(offset, offset + pageSize).map((x) => x.id));
    }

    const flattened = pages.flat();
    expect(flattened).toHaveLength(board.length);
    expect(new Set(flattened).size).toBe(board.length);
    expect(flattened).toEqual(board.map((x) => x.id));
  });
});
