import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getBoardForPricing,
  getCategoriesWithCounts,
  getProductBySlug,
} from "@/lib/board";
import { firstParam } from "@/lib/search-params";
import { rankPriceCents, totalToClaim } from "@/lib/pricing";
import { ClaimForm } from "@/components/claim/ClaimForm";

export const metadata: Metadata = {
  title: "Claim a rank",
  description:
    "Set a listing on the Thronely board at a rank you choose. You pay the difference between that rank's price and whatever your listing has already paid.",
  alternates: { canonical: "/claim" },
};

/** Ranks the chooser offers, so the select stays a sane length. */
const CHOOSABLE_RANKS = 25;

export default function ClaimPage({ searchParams }: PageProps<"/claim">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-14 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
          Checkout
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ivory sm:text-4xl">
          Claim a rank
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-mist">
          Pick the position you want and we will price it against the board as it
          stands right now. Nothing on the board moves until payment is
          confirmed.
        </p>
      </header>

      <div className="mt-10">
        <Suspense fallback={<ClaimFormSkeleton />}>
          <ClaimContent searchParams={searchParams} />
        </Suspense>
      </div>

      <p className="mt-8 text-sm leading-relaxed text-slate-dim">
        Not sure how the pricing works?{" "}
        <Link
          href="/rules"
          className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
        >
          Read the rules
        </Link>
        , or{" "}
        <Link
          href="/faq"
          className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
        >
          the FAQ
        </Link>
        .
      </p>
    </div>
  );
}

/** Two stacked cards, matching the loaded form so nothing jumps. */
function ClaimFormSkeleton() {
  return (
    <div role="status" aria-label="Loading the claim form" className="space-y-6">
      <span className="sr-only">Loading the claim form…</span>
      <div className="glass-strong rounded-card p-6">
        <div className="skeleton h-5 w-40 rounded" />
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="skeleton h-10 rounded-lg" />
          <div className="skeleton h-10 rounded-lg" />
        </div>
      </div>
      <div className="glass-strong rounded-card p-6">
        <div className="skeleton h-9 w-32 rounded" />
        <div className="skeleton mt-5 h-4 w-full rounded" />
        <div className="skeleton mt-2 h-4 w-2/3 rounded" />
        <div className="skeleton mt-6 h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Everything the form needs is computed here, on the server, from the live
 * board: the rank chooser re-navigates rather than pricing in the browser, so
 * the number on the button and the number the checkout route will charge come
 * from the same function.
 *
 * `searchParams` is read in here rather than in the page so the page body stays
 * free of runtime data and prerenders.
 */
async function ClaimContent({
  searchParams,
}: Pick<PageProps<"/claim">, "searchParams">) {
  const params = await searchParams;
  const categorySlug = firstParam(params.category);
  const productSlug = firstParam(params.product);

  const requested = Number(firstParam(params.rank) ?? "1");
  const rank =
    Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : 1;

  const [board, categories, existing] = await Promise.all([
    getBoardForPricing(categorySlug),
    getCategoriesWithCounts(),
    productSlug ? getProductBySlug(productSlug) : Promise.resolve(null),
  ]);

  const quote = totalToClaim({
    product: existing
      ? {
          id: existing.product.id,
          totalPaidCents: existing.product.totalPaidCents,
        }
      : null,
    targetRank: rank,
    board,
  });

  return (
    <ClaimForm
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      rankChoices={Array.from({ length: CHOOSABLE_RANKS }, (_, i) => i + 1)}
      prices={Array.from({ length: CHOOSABLE_RANKS }, (_, i) =>
        rankPriceCents(i + 1, board),
      )}
      rank={rank}
      categorySlug={categorySlug ?? ""}
      quote={quote}
      existing={
        existing
          ? {
              slug: existing.product.slug,
              title: existing.product.title,
              url: existing.product.url,
              description: existing.product.description,
              categorySlug: existing.product.category.slug,
              totalPaidCents: existing.product.totalPaidCents,
              rank: existing.rank,
            }
          : null
      }
    />
  );
}
