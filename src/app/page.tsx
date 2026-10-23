import { Suspense } from "react";
import {
  getAllTimeBoard,
  getBoardMoneyRange,
  getCategoriesWithCounts,
  getTodayBoard,
  getTopRows,
} from "@/lib/board";
import { Board } from "@/components/board/Board";
import { ClaimBox } from "@/components/board/ClaimBox";
import { ActivityFeed } from "@/components/board/ActivityFeed";
import { PodiumStage, TowerStage } from "@/components/three/SceneMount";
import { RenderModeToggle } from "@/components/three/RenderModeToggle";
import {
  BoardSkeleton,
  PodiumSkeleton,
  SidebarSkeleton,
} from "@/components/ui/Skeletons";
import { pageParam } from "@/lib/search-params";
import { StatsLineSuspended } from "@/components/ui/StatsLine";

// Under cacheComponents, uncached data must sit behind a <Suspense> boundary so
// the static shell can be prerendered and the dynamic parts stream in.

/**
 * The hero scene: the top three, as 3D blocks or as the 2D podium.
 *
 * Both renderings are fed the same `moneyRange`, so the switch between them
 * rescales nothing — it changes the medium, not the reading.
 */
async function PodiumSection() {
  const [rows, moneyRange] = await Promise.all([
    getTopRows(3),
    getBoardMoneyRange(),
  ]);

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="podium-heading" className="mt-14">
      <h2 id="podium-heading" className="sr-only">
        The current top three
      </h2>
      <PodiumStage rows={rows} moneyRange={moneyRange} />
      <RenderModeToggle className="mt-5" />
    </section>
  );
}

/**
 * The tower: the top twenty of the all-time board.
 *
 * Sits below the board rather than above it on purpose. The board is the
 * crawlable, accessible rendering of this exact data; putting the decorative
 * version first would bury the content behind it for anyone arriving without
 * JavaScript.
 */
async function TowerSection() {
  const boardPage = await getAllTimeBoard({ page: 1 });

  const entries = boardPage.rows.slice(0, 20).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    totalPaidCents: row.totalPaidCents,
    categoryName: row.category.name,
  }));

  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="tower-heading" className="mt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id="tower-heading"
          className="font-display text-2xl font-bold text-ivory sm:text-3xl"
        >
          The tower
        </h2>
        <p className="text-sm text-slate-dim">
          The top twenty, one block per listing, height scaling with money paid.
        </p>
      </div>
      <div className="mt-6">
        <TowerStage entries={entries} />
      </div>
    </section>
  );
}

async function BoardSection({
  period,
  categorySlug,
  page,
}: {
  period: "all-time" | "today";
  categorySlug?: string;
  page: number;
}) {
  const boardPage =
    period === "today"
      ? await getTodayBoard({ categorySlug, page })
      : await getAllTimeBoard({ categorySlug, page });

  const query = (target: number) => {
    const params = new URLSearchParams();
    if (categorySlug) params.set("category", categorySlug);
    if (target > 1) params.set("page", String(target));
    const suffix = params.toString();
    return suffix ? `/?${suffix}` : "/";
  };

  const todayHref = categorySlug
    ? `/category/${categorySlug}/today`
    : "/daily";
  const allTimeHref = categorySlug ? `/category/${categorySlug}` : "/";

  return (
    <Board
      boardPage={boardPage}
      period={period}
      allTimeHref={allTimeHref}
      todayHref={todayHref}
      buildPageHref={query}
      caption={period === "today" ? "Paid today" : "All-time leaders"}
    />
  );
}

/**
 * The filter bar and everything below it.
 *
 * This reads `searchParams` itself rather than the page doing it, so the page
 * body — and the hero above this — stays free of runtime data and prerenders
 * into the static shell. Under cacheComponents an uncached read outside a
 * Suspense boundary blocks the whole route and fails the build.
 */
async function HomeContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawCategory = params.category;
  const categorySlug = Array.isArray(rawCategory)
    ? rawCategory[0]
    : rawCategory;
  const period = params.period === "today" ? "today" : "all-time";
  const page = pageParam(params.page);

  // Categories drive the claim box's picker; cheap enough to fetch alongside.
  const categories = await getCategoriesWithCounts();
  const activeCategory = categories.find((c) => c.slug === categorySlug);

  return (
    <>
      <Suspense
        fallback={
          <div className="mt-14">
            <PodiumSkeleton />
          </div>
        }
      >
        <PodiumSection />
      </Suspense>

      <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_320px]">
        <Suspense fallback={<BoardSkeleton />}>
          <BoardSection
            period={period}
            categorySlug={activeCategory?.slug}
            page={page}
          />
        </Suspense>

        <aside className="space-y-6">
          <Suspense fallback={<SidebarSkeleton />}>
            <ClaimBox categorySlug={activeCategory?.slug} />
          </Suspense>
          <Suspense fallback={<SidebarSkeleton />}>
            <ActivityFeed />
          </Suspense>
        </aside>
      </div>

      <div className="mt-14">
        <Suspense fallback={<PodiumSkeleton />}>
          <TowerSection />
        </Suspense>
      </div>

      <div className="mt-14">
        <StatsLineSuspended />
      </div>
    </>
  );
}

/** Shown while the filtered board resolves; matches the live layout's height. */
function HomeFeedSkeleton() {
  return (
    <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_320px]">
      <BoardSkeleton />
      <SidebarSkeleton />
    </div>
  );
}

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <section className="pt-14 text-center sm:pt-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
          Pay to rank
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-bold leading-tight text-ivory sm:text-6xl">
          Every rank has a price.
          <span className="rank-numeral block">Someone is standing on it.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-mist sm:text-lg">
          Thronely is a leaderboard you can buy your way up. Outbid the holder of
          a rank and it is yours — until someone outbids you. No applications, no
          editors, no waiting.
        </p>
      </section>

      <Suspense fallback={<HomeFeedSkeleton />}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
