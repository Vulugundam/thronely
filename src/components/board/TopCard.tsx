import { TiltCard } from "./TiltCard";
import { OutboundLink } from "./OutboundLink";
import { formatUsd } from "@/lib/pricing";
import type { BoardRow as BoardRowData } from "@/lib/board";

const MEDALS = [
  { label: "Champion", ring: "border-gold-400/50", numeral: "rank-numeral" },
  { label: "Runner-up", ring: "border-white/16", numeral: "rank-numeral" },
  { label: "Third", ring: "border-violet-400/40", numeral: "rank-numeral-violet" },
] as const;

/**
 * The top three, given far more presence than row 4 and below — larger type,
 * a medal label, the description fully visible, and a stronger glass surface.
 */
export function TopCard({
  row,
  rank,
}: {
  row: BoardRowData;
  rank: 1 | 2 | 3;
}) {
  const medal = MEDALS[rank - 1];

  return (
    <TiltCard
      as="li"
      className={`glass-strong relative flex h-full flex-col rounded-card border ${medal.ring}`}
    >
      <div className="flex items-start justify-between gap-3 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span
            className={`${medal.numeral} text-4xl leading-none tabular-nums sm:text-5xl`}
            aria-label={`Rank ${rank}`}
          >
            {rank}
          </span>
          <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-mist">
            {medal.label}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 sm:px-6 sm:pb-6">
        <h3 className="font-display text-xl font-bold leading-tight text-ivory sm:text-2xl">
          <OutboundLink
            slug={row.slug}
            url={row.url}
            className="transition-colors hover:text-gold-400"
          >
            {row.title}
          </OutboundLink>
        </h3>

        <p className="mt-2.5 flex-1 text-sm leading-relaxed text-mist">
          {row.description}
        </p>

        <div className="mt-5 flex items-end justify-between gap-3 border-t border-white/8 pt-4">
          <span className="text-xs text-slate-dim">{row.category.name}</span>
          <span className="text-right">
            <span className="block font-display text-2xl font-bold text-gold-400 tabular-nums">
              {formatUsd(row.totalPaidCents)}
            </span>
            <span className="text-xs text-slate-dim">paid to hold this rank</span>
          </span>
        </div>
      </div>
    </TiltCard>
  );
}
