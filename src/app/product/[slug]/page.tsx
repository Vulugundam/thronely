import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getBoardForPricing,
  getProductBySlug,
  startOfTodayUtc,
} from "@/lib/board";
import { formatUsd, rankPriceCents, totalToClaim } from "@/lib/pricing";
import { PaymentStackStage } from "@/components/three/SceneMount";
import { OutboundLink } from "@/components/board/OutboundLink";

export async function generateMetadata({
  params,
}: PageProps<"/product/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProductBySlug(slug);
  if (!data) return { title: "Listing not found" };

  const { product, rank } = data;

  return {
    title: product.title,
    description: product.description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: `${product.title} — rank ${rank ?? "unranked"} on Thronely`,
      description: product.description,
      type: "website",
    },
  };
}

async function ProductDetail({ slug }: { slug: string }) {
  const data = await getProductBySlug(slug);
  if (!data) notFound();

  const { product, rank, clickCount, bids } = data;

  // Claims are priced against this listing's own category board, since that is
  // the board it competes on. The all-category board only applies to the
  // unfiltered homepage claim box.
  const board = await getBoardForPricing(product.category.slug);

  const claimable = rank === null ? null : rank - 1;

  // The destination when this listing is clicked.
  let host = product.url;
  try {
    host = new URL(product.url).host.replace(/^www\./, "");
  } catch {
    // Leave the raw string if it is not a parseable URL.
  }

  // Price of the next rank up, and of the throne itself.
  const nextRankQuote =
    claimable && claimable >= 1
      ? totalToClaim({
          product: { id: product.id, totalPaidCents: product.totalPaidCents },
          targetRank: claimable,
          board,
        })
      : null;

  const topQuote =
    rank !== null && rank > 1
      ? totalToClaim({
          product: { id: product.id, totalPaidCents: product.totalPaidCents },
          targetRank: 1,
          board,
        })
      : null;

  const since = await startOfTodayUtc();
  const paidTodayCents = bids
    .filter((bid) => bid.paidAt && bid.paidAt >= since)
    .reduce((sum, bid) => sum + bid.amountCents, 0);

  return (
    <article>
      <nav aria-label="Breadcrumb" className="text-sm text-slate-dim">
        <Link href="/" className="transition-colors hover:text-gold-400">
          Board
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <Link
          href={`/category/${product.category.slug}`}
          className="transition-colors hover:text-gold-400"
        >
          {product.category.name}
        </Link>
      </nav>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-bold text-ivory sm:text-4xl">
            {product.title}
          </h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-mist">
            {product.description}
          </p>
          <p className="mt-4 text-sm">
            <OutboundLink
              slug={product.slug}
              url={product.url}
              className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 transition-colors hover:text-gold-300"
            >
              Visit {host}
            </OutboundLink>
            <span className="ml-2 text-xs text-slate-dim">
              (paid placement — opens in a new tab)
            </span>
          </p>
        </div>

        <div className="glass-strong rounded-card px-6 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-dim">
            Current rank
          </p>
          <p className="rank-numeral mt-1 text-5xl font-bold tabular-nums">
            {rank ?? "—"}
          </p>
          <p className="mt-2 font-display text-xl font-bold text-gold-400 tabular-nums">
            {formatUsd(product.totalPaidCents)}
          </p>
          <p className="text-xs text-slate-dim">total paid</p>
        </div>
      </header>

      <dl className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Clicks out", value: clickCount.toLocaleString("en-US") },
          {
            label: "Payments",
            value: bids.length.toLocaleString("en-US"),
          },
          { label: "Paid today", value: formatUsd(paidTodayCents) },
        ].map((stat) => (
          <div key={stat.label} className="glass rounded-card p-5">
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim">
              {stat.label}
            </dt>
            <dd className="mt-2 font-display text-2xl font-bold text-ivory tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Claim a higher rank. */}
      {rank !== null && rank > 1 && (
        <section
          aria-labelledby="climb-heading"
          className="glass-strong mt-10 rounded-card p-6"
        >
          <h2
            id="climb-heading"
            className="font-display text-xl font-bold text-ivory"
          >
            Claim a higher rank
          </h2>
          <p className="mt-2 text-sm text-mist">
            You only pay the difference between the target rank&apos;s price and
            the {formatUsd(product.totalPaidCents)} already paid.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {nextRankQuote?.ok && claimable && (
              <div className="glass rounded-card p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim">
                  Next rank up
                </p>
                <p className="mt-1.5 font-display text-3xl font-bold text-ivory tabular-nums">
                  {formatUsd(nextRankQuote.deltaCents)}
                </p>
                <p className="mt-1 text-xs text-mist">
                  to take #{claimable}
                </p>
                <Link
                  href={`/claim?product=${product.slug}&rank=${claimable}`}
                  className="btn-claim mt-4 block w-full px-4 py-2.5 text-center text-sm"
                >
                  Claim #{claimable}
                </Link>
              </div>
            )}

            {topQuote?.ok && (
              <div className="glass rounded-card border-gold-400/30 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gold-400">
                  The throne
                </p>
                <p className="mt-1.5 font-display text-3xl font-bold text-ivory tabular-nums">
                  {formatUsd(topQuote.deltaCents)}
                </p>
                <p className="mt-1 text-xs text-mist">
                  to take #{1} — includes the {formatUsd(500)} top surcharge
                </p>
                <Link
                  href={`/claim?product=${product.slug}&rank=1`}
                  className="btn-claim mt-4 block w-full px-4 py-2.5 text-center text-sm"
                >
                  Claim #1
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {rank === null && (
        <section className="glass-strong mt-10 rounded-card p-6">
          <h2 className="font-display text-xl font-bold text-ivory">
            Not on the board yet
          </h2>
          <p className="mt-2 text-sm text-mist">
            This listing has not been paid for, so it holds no rank.
          </p>
          <Link
            href={`/claim?product=${product.slug}&rank=1`}
            className="btn-claim mt-5 inline-block px-5 py-2.5 text-sm"
          >
            Put it on the board for {formatUsd(rankPriceCents(1, board))}
          </Link>
        </section>
      )}

      <section aria-labelledby="history-heading" className="mt-10">
        <h2
          id="history-heading"
          className="font-display text-xl font-bold text-ivory"
        >
          Payment history
        </h2>
        <p className="mt-2 text-sm text-mist">
          Each segment is one payment. The stack is cumulative: this listing
          holds its rank with {formatUsd(product.totalPaidCents)}.
        </p>
        <div className="mt-5">
          <PaymentStackStage
            segments={bids.map((bid) => ({
              id: bid.id,
              amountCents: bid.amountCents,
              paidAt: bid.paidAt,
            }))}
            totalCents={product.totalPaidCents}
          />
        </div>
      </section>
    </article>
  );
}

function ProductSkeleton() {
  return (
    <div role="status" aria-label="Loading listing">
      <span className="sr-only">Loading listing…</span>
      <div className="skeleton h-4 w-40 rounded" />
      <div className="skeleton mt-6 h-10 w-2/3 rounded" />
      <div className="skeleton mt-4 h-5 w-full rounded" />
      <div className="skeleton mt-2 h-5 w-4/5 rounded" />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass rounded-card p-5">
            <div className="skeleton h-4 w-20 rounded" />
            <div className="skeleton mt-3 h-7 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProductPage({ params }: PageProps<"/product/[slug]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-14 sm:px-6">
      <Suspense fallback={<ProductSkeleton />}>
        <ProductContent params={params} />
      </Suspense>
    </div>
  );
}

async function ProductContent({
  params,
}: Pick<PageProps<"/product/[slug]">, "params">) {
  const { slug } = await params;
  if (!slug) notFound();
  return <ProductDetail slug={slug} />;
}
