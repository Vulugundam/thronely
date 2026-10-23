import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCategoriesWithCounts } from "@/lib/board";

export const metadata: Metadata = {
  title: "Categories",
  description:
    "Every Thronely board has its own top three. Pick a category and see who is standing on the podium.",
};

async function CategoryGrid() {
  const categories = await getCategoriesWithCounts();
  const populated = categories.filter((c) => c.productCount > 0);
  const empty = categories.filter((c) => c.productCount === 0);

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {populated.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/category/${category.slug}`}
              className="glass group flex h-full items-baseline justify-between gap-4 rounded-card p-5 transition-colors hover:border-gold-400/40"
            >
              <span className="font-display text-lg font-semibold text-ivory transition-colors group-hover:text-gold-400">
                {category.name}
              </span>
              <span className="shrink-0 text-sm text-slate-dim tabular-nums">
                {category.productCount} listing
                {category.productCount === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {empty.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-lg font-bold text-ivory">
            Empty boards — open for a first claim
          </h2>
          <p className="mt-2 text-sm text-mist">
            Nothing is standing here yet. The first listing in a category takes
            the throne for the minimum.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {empty.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/category/${category.slug}`}
                  className="inline-block rounded-full border border-white/12 bg-white/4 px-3.5 py-1.5 text-sm text-mist transition-colors hover:border-violet-400/40 hover:text-ivory"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function GridSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading categories"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <span className="sr-only">Loading categories…</span>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="glass flex items-center justify-between rounded-card p-5">
          <div className="skeleton h-5 w-1/2 rounded" />
          <div className="skeleton h-4 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
          Browse
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ivory sm:text-5xl">
          Categories
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-mist">
          Each category runs its own board with its own prices. Being #1 in a
          quiet category costs a fraction of being #40 overall.
        </p>
      </header>

      <div className="mt-10">
        <Suspense fallback={<GridSkeleton />}>
          <CategoryGrid />
        </Suspense>
      </div>
    </div>
  );
}
