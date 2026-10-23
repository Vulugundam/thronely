import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getAllTimeBoard,
  getBoardMoneyRange,
  getCategoryBySlug,
  getTodayBoard,
  getTopRows,
} from "@/lib/board";
import { pageParam } from "@/lib/search-params";
import { Board } from "./Board";
import { ClaimBox } from "./ClaimBox";
import { ActivityFeed } from "./ActivityFeed";
import { PodiumStage } from "@/components/three/SceneMount";
import { RenderModeToggle } from "@/components/three/RenderModeToggle";
import { BoardSkeleton, SidebarSkeleton } from "@/components/ui/Skeletons";

/**
 * The category's name and intro, split out so it can stream on its own.
 *
 * `params` is a runtime value under cacheComponents, so awaiting it in the page
 * body would block prerendering of the route. Here it sits inside its own
 * boundary: the heading waits for the request, the rest of the shell does not.
 */
export async function CategoryHeading({
  slug,
  period,
}: {
  slug: string;
  period: "all-time" | "today";
}) {
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  return (
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
        Category
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ivory sm:text-5xl">
        {category.name}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-mist">
        {period === "today"
          ? `Money paid in ${category.name} since midnight UTC.`
          : `The all-time ${category.name} board. These are the prices a claim here is measured against.`}
      </p>
    </header>
  );
}

/**
 * The category's top three, staged beside the board it belongs to.
 *
 * Scoped to the category on both queries — the rows *and* the money range. The
 * range matters as much as the rows: a category leader at $30 against the global
 * leader's $2,455 would draw as a sliver if the heights were scaled globally.
 *
 * Rendered on the all-time page only, and never on the Today tab. A podium draws
 * the listings that *hold* the top ranks, and ranks are held with cumulative
 * money; on a tab whose whole statement is "what moved since midnight UTC" it
 * would be answering a question nobody asked. The 2D twin is what a crawler sees
 * either way, so nothing is lost by keeping the Today tab to its own list.
 */
export async function CategoryPodium({ slug }: { slug: string }) {
  const [rows, moneyRange] = await Promise.all([
    getTopRows(3, slug),
    getBoardMoneyRange(slug),
  ]);

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="category-podium-heading" className="mt-12">
      <h2 id="category-podium-heading" className="sr-only">
        The top three in this category
      </h2>
      <PodiumStage rows={rows} moneyRange={moneyRange} />
      <RenderModeToggle className="mt-5" />
    </section>
  );
}

/**
 * Shared body for /category/[slug] and /category/[slug]/today.
 *
 * Reads `searchParams` itself — a URL can repeat a key, so `pageParam`
 * normalises it — and is always rendered inside a Suspense boundary by its
 * calling page, which is what keeps that runtime read off the shell.
 */
export async function CategoryScreen({
  slug,
  period,
  searchParams,
}: {
  slug: string;
  period: "all-time" | "today";
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = pageParam((await searchParams).page);
  const resolved =
    period === "today"
      ? await getTodayBoard({ categorySlug: slug, page })
      : await getAllTimeBoard({ categorySlug: slug, page });

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
      <Board
        boardPage={resolved}
        period={period}
        allTimeHref={`/category/${slug}`}
        todayHref={`/category/${slug}/today`}
        buildPageHref={(target) => {
          const base =
            period === "today"
              ? `/category/${slug}/today`
              : `/category/${slug}`;
          return target > 1 ? `${base}?page=${target}` : base;
        }}
        caption={period === "today" ? `Paid today` : `All-time leaders`}
      />

      <aside className="space-y-6">
        <Suspense fallback={<SidebarSkeleton />}>
          <ClaimBox categorySlug={slug} />
        </Suspense>
        <Suspense fallback={<SidebarSkeleton />}>
          <ActivityFeed limit={6} />
        </Suspense>
      </aside>
    </div>
  );
}

/** Fallback for the heading while the slug resolves. */
export function CategoryHeadingSkeleton() {
  return (
    <div role="status" aria-label="Loading category">
      <span className="sr-only">Loading category…</span>
      <div className="skeleton h-4 w-24 rounded" />
      <div className="skeleton mt-4 h-10 w-64 rounded" />
      <div className="skeleton mt-4 h-5 w-full max-w-2xl rounded" />
    </div>
  );
}

/** Fallback for the board and sidebar while they resolve. */
export function CategoryScreenSkeleton() {
  return (
    <div role="status" aria-label="Loading category board">
      <span className="sr-only">Loading category…</span>
      <div className="mt-10">
        <BoardSkeleton />
      </div>
    </div>
  );
}
