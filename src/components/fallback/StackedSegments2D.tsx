import { formatUsd } from "@/lib/pricing";

export type Segment = {
  id: string;
  amountCents: number;
  paidAt: Date | null;
};

/**
 * The product's payment history as a stack of segments, one per paid bid.
 *
 * This is the honest version of the "block with rank history" idea: each
 * segment is a real payment, and the stack grows with cumulative money. An
 * actual *historical rank* per bid is not derivable, because ranks depend on
 * every other product's total at that instant and those snapshots are not
 * stored — showing one would mean inventing it. Cumulative paid is real data.
 */
export function StackedSegments2D({
  segments,
  totalCents,
}: {
  segments: Segment[];
  totalCents: number;
}) {
  if (segments.length === 0) {
    return (
      <p className="text-sm text-slate-dim">
        No payments yet. This listing has not been on the board.
      </p>
    );
  }

  // Alternate warm/cool so adjacent segments stay distinguishable.
  const tones = [
    "from-gold-400/85 to-gold-600/70",
    "from-violet-400/85 to-violet-600/70",
  ];

  return (
    <div>
      {/* The stack: width is proportional to each payment's share of the total. */}
      <div
        className="flex h-16 w-full overflow-hidden rounded-lg border border-white/12"
        role="img"
        aria-label={`${segments.length} payments totalling ${formatUsd(totalCents)}`}
      >
        {segments.map((segment, index) => {
          const share =
            totalCents > 0 ? (segment.amountCents / totalCents) * 100 : 0;
          return (
            <div
              key={segment.id}
              className={`bg-gradient-to-b ${tones[index % tones.length]}`}
              style={{ width: `${Math.max(share, 2)}%` }}
            />
          );
        })}
      </div>

      {/* The same data as text, which is what assistive tech reads. */}
      <ol className="mt-4 space-y-2">
        {segments.map((segment, index) => (
          <li
            key={segment.id}
            className="flex items-baseline justify-between gap-4 text-sm"
          >
            <span className="text-mist">
              <span
                aria-hidden="true"
                className={`mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-gradient-to-b ${
                  tones[index % tones.length]
                }`}
              />
              Payment {index + 1}
            </span>
            <span className="tabular-nums text-ivory">
              {formatUsd(segment.amountCents)}
            </span>
            <time
              dateTime={segment.paidAt?.toISOString()}
              className="shrink-0 text-xs text-slate-dim"
            >
              {segment.paidAt
                ? new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }).format(segment.paidAt)
                : "—"}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}
