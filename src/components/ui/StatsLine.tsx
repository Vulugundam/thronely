import { Suspense } from "react";
import { getPublicStats } from "@/lib/stats";
import { formatUsd } from "@/lib/pricing";

/**
 * The public scoreboard: how many visitors, how much money, how many listings,
 * how long the board has been running.
 *
 * Server component, and the numbers are real queries rather than stored
 * counters — a counter can drift from the data it claims to describe, and this
 * line is a public claim about the site, so it has to be derived.
 */
export async function StatsLine() {
  const stats = await getPublicStats();

  const items = [
    { label: "Visitors", value: stats.visitors.toLocaleString("en-US") },
    { label: "Paid to the board", value: formatUsd(stats.revenueCents) },
    { label: "Listings", value: stats.listings.toLocaleString("en-US") },
    { label: "Days live", value: stats.daysLive.toLocaleString("en-US") },
  ];

  return (
    <section
      aria-label="Thronely in numbers"
      className="glass rounded-card px-5 py-4"
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim">
              {item.label}
            </dt>
            <dd className="mt-1 font-display text-xl font-bold text-ivory tabular-nums">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Same footprint as the loaded line, so nothing shifts when it streams in. */
export function StatsLineSkeleton() {
  return (
    <section
      role="status"
      aria-label="Loading site statistics"
      className="glass rounded-card px-5 py-4"
    >
      <span className="sr-only">Loading site statistics…</span>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton mt-2 h-6 w-14 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Convenience wrapper so callers do not repeat the boundary. */
export function StatsLineSuspended() {
  return (
    <Suspense fallback={<StatsLineSkeleton />}>
      <StatsLine />
    </Suspense>
  );
}
