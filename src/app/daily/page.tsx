import { Suspense } from "react";
import type { Metadata } from "next";
import { getTodayBoard } from "@/lib/board";
import { startOfTodayUtc } from "@/lib/board";
import { Board } from "@/components/board/Board";
import { ActivityFeed } from "@/components/board/ActivityFeed";
import { BoardSkeleton, SidebarSkeleton } from "@/components/ui/Skeletons";
import { pageParam } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Today's leaders",
  description:
    "Who has paid the most on Thronely since midnight UTC. The board resets every day — the money does not.",
};

/**
 * The board streams, and it reads `searchParams` itself so the page above it
 * touches no runtime data at all.
 *
 * Under cacheComponents an uncached read — `searchParams` included — that
 * happens outside a Suspense boundary blocks prerendering of the whole route
 * and fails the build. Keeping the await in here means the shell prerenders and
 * only this subtree waits.
 */
async function TodayBoard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = pageParam((await searchParams).page);
  const boardPage = await getTodayBoard({ page });

  return (
    <Board
      boardPage={boardPage}
      period="today"
      allTimeHref="/"
      todayHref="/daily"
      buildPageHref={(target) =>
        target > 1 ? `/daily?page=${target}` : "/daily"
      }
      caption="Paid today"
    />
  );
}

/**
 * The reset label is computed inside this boundary rather than in the page.
 *
 * `startOfTodayUtc()` reads the clock, and reading the clock during prerender
 * is an unstable value — so the header that mentions the day boundary has to
 * wait for the request, while the rest of the shell goes static.
 */
async function DailyHeaderIntro() {
  const since = await startOfTodayUtc();
  const resetLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(since);

  return (
    <p className="mt-4 max-w-2xl text-base leading-relaxed text-mist">
      Ranked by money paid since midnight UTC (day started {resetLabel}).
      Today&apos;s board is a lens on the same listings — claims are always
      priced against the all-time board, because money already paid never
      expires.
    </p>
  );
}

export default function DailyPage({ searchParams }: PageProps<"/daily">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
          Today
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ivory sm:text-5xl">
          The daily board
        </h1>
        <Suspense fallback={<div className="mt-4 h-14 max-w-2xl" />}>
          <DailyHeaderIntro />
        </Suspense>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <Suspense fallback={<BoardSkeleton />}>
          <TodayBoard searchParams={searchParams} />
        </Suspense>
        <aside>
          <Suspense fallback={<SidebarSkeleton />}>
            <ActivityFeed limit={10} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
