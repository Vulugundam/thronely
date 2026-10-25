import Link from "next/link";
import { formatUsd } from "@/lib/pricing";

export type TowerRow = {
  id: string;
  slug: string;
  title: string;
  totalPaidCents: number;
  categoryName: string;
};

/** Matches the 3D tower's height so promoting to 3D does not shift the page. */
const TOWER_HEIGHT = "clamp(360px, 48vw, 520px)";

/**
 * The tower view in 2D: the top twenty as vertical bars.
 *
 * This is the twin of `TowerScene`, and the accessible one. Bar heights use the
 * same square-root scale as the 3D version so the two agree visually about what
 * the data says — but here every title, category and price is real text in the
 * HTML, which is what a crawler or a screen reader actually receives.
 *
 * The bars are decorative and hidden from assistive tech; the list underneath is
 * the content. Showing both would mean a screen reader heard the top twenty
 * twice.
 */
export function Tower2D({ entries }: { entries: TowerRow[] }) {
  if (entries.length === 0) return null;

  const values = entries.map((entry) => entry.totalPaidCents);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const heightPercent = (cents: number) => {
    if (max <= min) return 60;
    const normalised = (cents - min) / (max - min);
    return 18 + Math.sqrt(Math.max(0, normalised)) * 82;
  };

  return (
    <div style={{ height: TOWER_HEIGHT }} className="w-full">
      {/* The bars: a quick visual read of the shape of the top twenty. */}
      <div
        aria-hidden="true"
        className="flex h-full items-end justify-center gap-1.5 sm:gap-2"
      >
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            className={`w-full max-w-6 flex-1 rounded-t-sm ${
              index === 0
                ? "bg-gradient-to-t from-gold-600/40 to-gold-400"
                : index === 1
                  ? "bg-gradient-to-t from-white/10 to-white/45"
                  : index === 2
                    ? "bg-gradient-to-t from-violet-600/40 to-violet-400"
                    : "bg-gradient-to-t from-white/5 to-white/20"
            }`}
            style={{ height: `${heightPercent(entry.totalPaidCents)}%` }}
          />
        ))}
      </div>
      <div className="rule-gold mt-3" />

      <ol className="mt-5 grid gap-2 sm:grid-cols-2">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            className="glass flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
          >
            <span
              className={`w-7 shrink-0 text-center font-display text-sm font-bold tabular-nums ${
                index === 0
                  ? "rank-numeral"
                  : index < 3
                    ? "rank-numeral-violet"
                    : "text-slate-dim"
              }`}
            >
              {index + 1}
            </span>
            <Link
              href={`/product/${entry.slug}`}
              className="min-w-0 flex-1 truncate text-ivory transition-colors hover:text-gold-400"
            >
              {entry.title}
            </Link>
            <span className="shrink-0 text-xs text-slate-dim">
              {entry.categoryName}
            </span>
            <span className="shrink-0 font-semibold text-gold-400 tabular-nums">
              {formatUsd(entry.totalPaidCents)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
