import { TiltCard } from "./TiltCard";
import { OutboundLink } from "./OutboundLink";
import { formatUsd } from "@/lib/pricing";
import type { BoardRow as BoardRowData } from "@/lib/board";

/**
 * A single board entry below the top three.
 *
 * The whole row is real HTML — rank, title, price, category are all text nodes,
 * so they remain crawlable, selectable and screen-reader accessible. Any 3D
 * treatment is layered on top of this, never instead of it.
 */
export function BoardRow({
  row,
  rank,
}: {
  row: BoardRowData;
  rank: number;
}) {
  return (
    <TiltCard as="li" className="glass rounded-card">
      <div className="flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
        <span
          className="rank-numeral w-10 shrink-0 text-right text-2xl tabular-nums sm:w-12 sm:text-3xl"
          aria-label={`Rank ${rank}`}
        >
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <OutboundLink
            slug={row.slug}
            url={row.url}
            showHost
            className="font-display text-base font-semibold text-ivory transition-colors hover:text-gold-400 sm:text-lg"
          >
            {row.title}
          </OutboundLink>

          <p className="mt-1 line-clamp-2 text-sm text-mist">
            {row.description}
          </p>

          <p className="mt-2 text-xs text-slate-dim">
            <span className="rounded-full border border-white/10 px-2 py-0.5">
              {row.category.name}
            </span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-lg font-bold text-gold-400 tabular-nums sm:text-xl">
            {formatUsd(row.totalPaidCents)}
          </p>
          <p className="mt-0.5 text-xs text-slate-dim">paid</p>
        </div>
      </div>
    </TiltCard>
  );
}
