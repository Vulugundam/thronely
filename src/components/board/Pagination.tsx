import Link from "next/link";

/**
 * Offset pagination. Safe because the board order is a *total* order — money,
 * then bid time, then id (see ranking.ts) — so a row cannot be dropped or shown
 * twice across pages even while bids land underneath.
 */
export function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const linkClass =
    "rounded-lg border border-white/12 bg-white/4 px-3.5 py-2 text-sm text-ivory transition-colors hover:border-gold-400/40 hover:bg-white/8";
  const disabledClass =
    "rounded-lg border border-white/6 px-3.5 py-2 text-sm text-slate-dim/50";

  return (
    <nav
      aria-label="Board pages"
      className="mt-8 flex items-center justify-between gap-4"
    >
      {page > 1 ? (
        <Link href={buildHref(page - 1)} rel="prev" className={linkClass}>
          ← Previous
        </Link>
      ) : (
        <span className={disabledClass} aria-hidden="true">
          ← Previous
        </span>
      )}

      <span className="text-sm text-mist tabular-nums">
        Page {page} of {totalPages}
      </span>

      {page < totalPages ? (
        <Link href={buildHref(page + 1)} rel="next" className={linkClass}>
          Next →
        </Link>
      ) : (
        <span className={disabledClass} aria-hidden="true">
          Next →
        </span>
      )}
    </nav>
  );
}
