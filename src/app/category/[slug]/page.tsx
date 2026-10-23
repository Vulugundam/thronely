import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryBySlug } from "@/lib/board";
import {
  CategoryHeading,
  CategoryHeadingSkeleton,
  CategoryPodium,
  CategoryScreen,
  CategoryScreenSkeleton,
} from "@/components/board/CategoryScreen";
import { PodiumSkeleton } from "@/components/ui/Skeletons";

export async function generateMetadata({
  params,
}: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };

  return {
    title: `${category.name} leaderboard`,
    description: `The all-time ${category.name} leaderboard on Thronely. Every rank has a price, and these are the listings currently standing on them.`,
    alternates: { canonical: `/category/${category.slug}` },
  };
}

/**
 * `params` is passed down as a promise and awaited inside the Suspense
 * boundaries below, so the page body touches no runtime data and Next.js can
 * prerender the static shell for this dynamic route. Awaited here instead, it
 * would block the whole route — under cacheComponents that fails the build.
 */
export default function CategoryPage({
  params,
  searchParams,
}: PageProps<"/category/[slug]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6">
      <Suspense fallback={<CategoryHeadingSkeleton />}>
        <CategoryHeadingAsync params={params} period="all-time" />
      </Suspense>

      {/*
        Its own boundary, above the board. A podium for a category with no paid
        listings renders nothing at all rather than an empty stage, so on a fresh
        category the heading is immediately followed by the board.
      */}
      <Suspense fallback={<CategoryPodiumFallback />}>
        <CategoryPodiumAsync params={params} />
      </Suspense>

      <Suspense fallback={<CategoryScreenSkeleton />}>
        <CategoryContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CategoryPodiumAsync({
  params,
}: Pick<PageProps<"/category/[slug]">, "params">) {
  const { slug } = await params;
  if (!slug) return null;
  return <CategoryPodium slug={slug} />;
}

/**
 * Placeholder for the podium boundary.
 *
 * The 2D podium is only ~440px tall, so a full-height skeleton would make the
 * board below it jump upward once the real podium streams in.
 */
function CategoryPodiumFallback() {
  return (
    <div className="mt-12">
      <PodiumSkeleton />
    </div>
  );
}

async function CategoryHeadingAsync({
  params,
  period,
}: Pick<PageProps<"/category/[slug]">, "params"> & {
  period: "all-time" | "today";
}) {
  const { slug } = await params;
  if (!slug) notFound();
  return <CategoryHeading slug={slug} period={period} />;
}

async function CategoryContent({
  params,
  searchParams,
}: Pick<PageProps<"/category/[slug]">, "params" | "searchParams">) {
  const { slug } = await params;
  if (!slug) notFound();

  return (
    <CategoryScreen slug={slug} period="all-time" searchParams={searchParams} />
  );
}
