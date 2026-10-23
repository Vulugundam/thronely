import Link from "next/link";

/**
 * All-time / Today switch.
 *
 * These are real links, not client-side state, so each board is a crawlable,
 * shareable URL and works without JavaScript. Note that the active tab only
 * changes what is *displayed*: claims are always priced against the all-time
 * board, because money paid is cumulative and never expires.
 */
export function BoardTabs({
  allTimeHref,
  todayHref,
  active,
}: {
  allTimeHref: string;
  todayHref: string;
  active: "all-time" | "today";
}) {
  const base =
    "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap";

  return (
    <div
      role="group"
      aria-label="Board period"
      className="inline-flex gap-1 rounded-xl border border-white/10 bg-white/4 p-1"
    >
      <Link
        href={allTimeHref}
        aria-current={active === "all-time" ? "page" : undefined}
        className={`${base} ${
          active === "all-time"
            ? "bg-gold-400/15 text-gold-300"
            : "text-mist hover:text-ivory"
        }`}
      >
        All-time
      </Link>
      <Link
        href={todayHref}
        aria-current={active === "today" ? "page" : undefined}
        className={`${base} ${
          active === "today"
            ? "bg-violet-400/15 text-violet-300"
            : "text-mist hover:text-ivory"
        }`}
      >
        Today
      </Link>
    </div>
  );
}
