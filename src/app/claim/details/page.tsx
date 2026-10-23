import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getBoardForPricing,
  getCategoriesWithCounts,
  getProductBySlug,
} from "@/lib/board";
import { firstParam } from "@/lib/search-params";
import { MAX_DESCRIPTION_LENGTH } from "@/lib/listing";
import { totalToClaim } from "@/lib/pricing";
import { ClaimDetailsForm } from "@/components/claim/ClaimDetailsForm";

/** Two stacked cards, matching the loaded form so nothing jumps. */
function DetailsSkeleton() {
  return (
    <div role="status" aria-label="Loading the listing form" className="space-y-6">
      <span className="sr-only">Loading the listing form…</span>
      <div className="glass-strong rounded-card p-6">
        <div className="skeleton h-5 w-32 rounded" />
        <div className="skeleton mt-5 h-10 rounded-lg" />
        <div className="skeleton mt-5 h-10 rounded-lg" />
        <div className="skeleton mt-5 h-24 rounded-lg" />
      </div>
      <div className="glass-strong rounded-card p-6">
        <div className="skeleton h-9 w-32 rounded" />
        <div className="skeleton mt-6 h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

export const metadata: Metadata = {
  title: "Listing details",
  description:
    "Describe the listing you are putting on the Thronely board, then continue to checkout.",
  alternates: { canonical: "/claim/details" },
  robots: { index: false, follow: false },
};


export default function ClaimDetailsPage({
  searchParams,
}: PageProps<"/claim/details">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-14 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-dim">
        <Link href="/claim" className="transition-colors hover:text-gold-400">
          Claim a rank
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-mist">Listing details</span>
      </nav>

      <h1 className="mt-6 font-display text-3xl font-bold text-ivory sm:text-4xl">
        Describe the listing
      </h1>
      <p className="mt-4 text-base leading-relaxed text-mist">
        This is what visitors will see on the board. Keep it plain and accurate —
        we refuse submissions that break the prohibited list.
      </p>

      <div className="mt-10">
        <Suspense fallback={<DetailsSkeleton />}>
          <DetailsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * `searchParams` is read in here rather than in the page body.
 *
 * It is runtime data under cacheComponents, so awaiting it in the page would
 * block prerendering of the route entirely.
 */
async function DetailsContent({
  searchParams,
}: Pick<PageProps<"/claim/details">, "searchParams">) {
  const params = await searchParams;
  const categorySlug = firstParam(params.category);
  const productSlug = firstParam(params.product);
  const errorMessage = firstParam(params.error);
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

  // Re-quoting here matters: the board can move between choosing a rank and
  // filling in the details, and the charge must reflect the current price.
  if (!quote.ok) {
    return (
      <section className="glass-strong rounded-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-ivory">
          That rank is no longer available to claim
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          {quote.message} The board moved between choosing a rank and getting
          here.
        </p>
        <Link
          href="/claim"
          className="btn-claim mt-5 inline-block px-4 py-2.5 text-sm"
        >
          Choose another rank
        </Link>
      </section>
    );
  }

  return (
    <>
      {/*
       * A refusal from the checkout route lands here with its reason on the query
       * string. Without this the buyer would be bounced back to a page that looks
       * exactly like the one they left, with no way to tell that anything was
       * declined — and a silent bounce on a payment form is where someone presses
       * the button a second time.
       *
       * Rendered above the form rather than replacing it, so the fields they
       * filled in are still there and the new price is right below.
       */}
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-card border border-violet-400/30 bg-violet-400/8 p-4 text-sm leading-relaxed text-mist"
        >
          {errorMessage}
        </div>
      ) : null}

      <ClaimDetailsForm
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        defaultCategory={existing?.product.category.slug ?? categorySlug ?? ""}
        payment={{
          rank: quote.targetRank,
          deltaCents: quote.deltaCents,
          rankPriceCents: quote.rankPriceCents,
          currentTotalCents: quote.currentTotalCents,
        }}
        maxDescriptionLength={MAX_DESCRIPTION_LENGTH}
        existing={
          existing
            ? {
                slug: existing.product.slug,
                url: existing.product.url,
                title: existing.product.title,
                description: existing.product.description,
              }
            : null
        }
      />
    </>
  );
}
