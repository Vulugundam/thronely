import { prisma } from "@/lib/db";
import { markRequestTime } from "@/lib/request-time";
import { formatUsd } from "@/lib/pricing";

/** How long ago, in the compact form a feed row needs. */
function relativeTime(from: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(from);
}

/**
 * Latest paid bids across the board.
 *
 * Only `paid` bids appear: a pending checkout is not activity, it is intent, and
 * showing it would let anyone fake a movement by opening a checkout and
 * abandoning it.
 */
export async function ActivityFeed({ limit = 8 }: { limit?: number }) {
  await markRequestTime();

  const bids = await prisma.bid.findMany({
    where: { status: "paid", product: { hidden: false } },
    orderBy: { paidAt: "desc" },
    take: limit,
    select: {
      id: true,
      amountCents: true,
      paidAt: true,
      product: { select: { slug: true, title: true } },
    },
  });

  if (bids.length === 0) return null;

  const now = new Date();

  return (
    <section aria-labelledby="activity-heading" className="glass rounded-card p-5">
      <h2
        id="activity-heading"
        className="font-display text-base font-bold text-ivory"
      >
        Latest activity
      </h2>

      <ol className="mt-4 space-y-3">
        {bids.map((bid) => (
          <li key={bid.id} className="flex items-baseline gap-2 text-sm">
            <span
              aria-hidden="true"
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400"
            />
            <span className="min-w-0 flex-1 text-mist">
              <a
                href={`/product/${bid.product.slug}`}
                className="font-medium text-ivory transition-colors hover:text-gold-400"
              >
                {bid.product.title}
              </a>{" "}
              paid{" "}
              <span className="font-semibold text-gold-400 tabular-nums">
                {formatUsd(bid.amountCents)}
              </span>
            </span>
            <time
              dateTime={bid.paidAt?.toISOString()}
              className="shrink-0 text-xs text-slate-dim"
            >
              {bid.paidAt ? relativeTime(bid.paidAt, now) : "—"}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
