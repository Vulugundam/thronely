import { BoardTabs } from "./BoardTabs";
import { BoardRow } from "./BoardRow";
import { TopCard } from "./TopCard";
import { Pagination } from "./Pagination";
import type { BoardPage } from "@/lib/board";

/**
 * The 2D board — the accessible, crawlable source of truth for every page.
 *
 * This is rendered server-side on every route, including the ones that also
 * mount a 3D scene. Because the 3D canvas is loaded with `ssr: false`, its DOM
 * does not exist until the client bundle runs; this board is what a crawler, a
 * screen reader, or a visitor with JavaScript disabled actually receives.
 */
export function Board({
  boardPage,
  period,
  allTimeHref,
  todayHref,
  buildPageHref,
  caption,
}: {
  boardPage: BoardPage;
  period: "all-time" | "today";
  allTimeHref: string;
  todayHref: string;
  buildPageHref: (page: number) => string;
  caption: string;
}) {
  const { rows, page, totalPages, total } = boardPage;

  // Pagination offsets the whole board, so ranks must continue across pages.
  const rankOffset = (page - 1) * 50;
  const topRows = page === 1 ? rows.slice(0, 3) : [];
  const restRows = page === 1 ? rows.slice(3) : rows;

  return (
    <section aria-labelledby="board-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2
          id="board-heading"
          className="font-display text-2xl font-bold text-ivory sm:text-3xl"
        >
          {caption}
        </h2>
        <BoardTabs
          allTimeHref={allTimeHref}
          todayHref={todayHref}
          active={period}
        />
      </div>

      <p className="mt-2 text-sm text-slate-dim">
        {total === 0
          ? "No listings yet."
          : `${total} listing${total === 1 ? "" : "s"}${
              totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""
            }`}
      </p>

      {topRows.length > 0 && (
        <>
          <h3 className="sr-only">Top three</h3>
          <ol className="mt-6 grid gap-5 md:grid-cols-3">
            {topRows.map((row, index) => (
              <TopCard
                key={row.id}
                row={row}
                rank={(index + 1) as 1 | 2 | 3}
              />
            ))}
          </ol>
        </>
      )}

      {restRows.length > 0 && (
        <>
          <h3 className="sr-only">
            {page === 1 ? "Ranks four and below" : "Listings"}
          </h3>
          <ol className="mt-5 grid gap-3">
            {restRows.map((row, index) => (
              <BoardRow
                key={row.id}
                row={row}
                rank={rankOffset + topRows.length + index + 1}
              />
            ))}
          </ol>
        </>
      )}

      {total === 0 && (
        <p className="glass mt-6 rounded-card p-8 text-center text-mist">
          The board is empty. Be the first to claim a rank.
        </p>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={buildPageHref}
      />
    </section>
  );
}
