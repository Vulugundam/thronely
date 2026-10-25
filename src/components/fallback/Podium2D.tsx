import Link from "next/link";
import { formatUsd } from "@/lib/pricing";
import type { BoardRow } from "@/lib/board";

/**
 * A 2D rendering of the podium: the top three on blocks whose heights scale with
 * money paid, crown above #1.
 *
 * This is not just the WebGL fallback — it is the primary semantic version of
 * the hero. It is server-rendered real HTML, so the ranks, titles and prices
 * exist in the response for crawlers and screen readers. The 3D scene, when it
 * loads, is layered on top as decoration and can be switched off at any time.
 */
export function Podium2D({
  rows,
  moneyRange,
}: {
  rows: BoardRow[];
  moneyRange: { min: number; max: number };
}) {
  if (rows.length === 0) return null;

  // Order for display: #2 on the left, #1 in the middle, #3 on the right.
  const order = [1, 0, 2];
  const { min, max } = moneyRange;

  const heightPercent = (cents: number) => {
    if (max <= min) return 70;
    // Keep a visible floor so the shortest block still reads as a block.
    const ratio = (cents - min) / (max - min);
    return 38 + ratio * 62;
  };

  /** Matches the 3D podium's height so promoting to 3D does not shift the page. */
  const PODIUM_HEIGHT = "clamp(320px, 42vw, 440px)";

  return (
    <div style={{ height: PODIUM_HEIGHT }} className="w-full">
      <div className="flex items-end justify-center gap-3 sm:gap-6 h-full">
        {order.map((index) => {
          const row = rows[index];
          if (!row) {
            return (
              <li
                key={`empty-${index}`}
                className="w-24 sm:w-44"
                aria-hidden="true"
              />
            );
          }

          const rank = index + 1;
          const isTop = rank === 1;

          return (
            <li
              key={row.id}
              className="flex w-28 flex-col items-center sm:w-48"
            >
              {/* Crown sits above the winning block. */}
              {isTop && (
                <span
                  aria-hidden="true"
                  className="mb-2 text-2xl text-gold-400 drop-shadow-[0_0_12px_oklch(0.84_0.13_85/0.55)] sm:text-3xl"
                >
                  ♛
                </span>
              )}

              <Link
                href={`/product/${row.slug}`}
                className="group w-full text-center"
                aria-label={`Rank ${rank}: ${row.title}, ${formatUsd(row.totalPaidCents)} paid`}
              >
                <span className="block truncate font-display text-sm font-semibold text-ivory group-hover:text-gold-400 sm:text-base">
                  {row.title}
                </span>
                <span className="mt-0.5 block text-xs text-gold-400 tabular-nums sm:text-sm">
                  {formatUsd(row.totalPaidCents)}
                </span>
              </Link>

              {/* The block. */}
              <div
                className={`mt-3 w-full rounded-t-lg border-t ${
                  isTop
                    ? "border-gold-400/60 bg-gradient-to-b from-gold-400/28 to-gold-600/6"
                    : rank === 2
                      ? "border-white/25 bg-gradient-to-b from-white/14 to-white/3"
                      : "border-violet-400/50 bg-gradient-to-b from-violet-400/22 to-violet-600/5"
                }`}
                style={{ height: `${heightPercent(row.totalPaidCents)}px` }}
              >
                <span
                  className={`flex h-full items-start justify-center pt-3 font-display text-3xl font-bold tabular-nums ${
                    rank === 3 ? "rank-numeral-violet" : "rank-numeral"
                  }`}
                >
                  {rank}
                </span>
              </div>
            </li>
          );
        })}
      </div>

      {/* Plinth, so the blocks stand on something. */}
      <div className="rule-gold" />
    </div>
  );
}