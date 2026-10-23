"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUsd, type ClaimQuote } from "@/lib/pricing";

export type CategoryOption = { slug: string; name: string };

export type ExistingListing = {
  slug: string;
  title: string;
  url: string;
  description: string;
  categorySlug: string;
  totalPaidCents: number;
  rank: number | null;
};

/**
 * Step one of a claim: choose the position and see exactly what it costs.
 *
 * Every price shown here was computed on the server and passed down, so this
 * component never does pricing arithmetic of its own. Changing the rank or the
 * category navigates, which re-runs the server calculation — that is what keeps
 * a stale price from ever reaching the checkout button.
 */
export function ClaimForm({
  categories,
  rankChoices,
  prices,
  rank,
  categorySlug,
  quote,
  existing,
}: {
  categories: CategoryOption[];
  rankChoices: number[];
  /** Index 0 is rank 1. */
  prices: number[];
  rank: number;
  categorySlug: string;
  quote: ClaimQuote;
  existing: ExistingListing | null;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(categorySlug);

  const hrefFor = (targetRank: number, nextCategory: string) => {
    const params = new URLSearchParams();
    if (existing) params.set("product", existing.slug);
    if (nextCategory) params.set("category", nextCategory);
    params.set("rank", String(targetRank));
    return `/claim?${params.toString()}`;
  };

  const detailsHref = (() => {
    const params = new URLSearchParams();
    if (existing) params.set("product", existing.slug);
    if (category) params.set("category", category);
    params.set("rank", String(rank));
    return `/claim/details?${params.toString()}`;
  })();

  return (
    <div className="space-y-6">
      {existing && (
        <section className="glass rounded-card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim">
            Raising an existing listing
          </h2>
          <p className="mt-2 font-display text-lg font-bold text-ivory">
            {existing.title}
          </p>
          <p className="mt-1 text-sm text-mist">
            Currently{" "}
            {existing.rank ? `rank #${existing.rank}` : "not on the board"} with{" "}
            {formatUsd(existing.totalPaidCents)} paid. You pay the difference,
            not the full price.
          </p>
        </section>
      )}

      <section
        aria-labelledby="rank-heading"
        className="glass-strong rounded-card p-5 sm:p-6"
      >
        <h2
          id="rank-heading"
          className="font-display text-lg font-bold text-ivory"
        >
          Choose the position
        </h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="claim-rank"
              className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim"
            >
              Rank
            </label>
            <select
              id="claim-rank"
              value={rank}
              onChange={(event) =>
                router.push(hrefFor(Number(event.currentTarget.value), category))
              }
              className="mt-2 w-full rounded-lg border border-white/12 bg-abyss-900 px-3 py-2.5 text-sm text-ivory"
            >
              {rankChoices.map((choice) => (
                <option key={choice} value={choice}>
                  #{choice} — {formatUsd(prices[choice - 1] ?? 0)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="claim-category"
              className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim"
            >
              Category
            </label>
            <select
              id="claim-category"
              value={category}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setCategory(next);
                router.push(hrefFor(rank, next));
              }}
              disabled={existing !== null}
              className="mt-2 w-full rounded-lg border border-white/12 bg-abyss-900 px-3 py-2.5 text-sm text-ivory disabled:opacity-60"
            >
              <option value="">All categories</option>
              {categories.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
            {existing && (
              <p className="mt-2 text-xs text-slate-dim">
                An existing listing keeps its category.
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="total-heading"
        className="glass-strong rounded-card p-5 sm:p-6"
      >
        <h2 id="total-heading" className="sr-only">
          What you pay
        </h2>

        {quote.ok ? (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-display text-base font-bold text-ivory">
                You pay
              </span>
              <span
                aria-live="polite"
                className="rank-numeral font-display text-4xl font-bold tabular-nums"
              >
                {formatUsd(quote.deltaCents)}
              </span>
            </div>

            <dl className="mt-5 space-y-2 border-t border-white/8 pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-mist">Price of rank #{quote.targetRank}</dt>
                <dd className="tabular-nums text-ivory">
                  {formatUsd(quote.rankPriceCents)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-mist">Already paid</dt>
                <dd className="tabular-nums text-ivory">
                  −{formatUsd(quote.currentTotalCents)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-white/8 pt-2 font-semibold">
                <dt className="text-ivory">Total charge</dt>
                <dd className="tabular-nums text-gold-400">
                  {formatUsd(quote.deltaCents)}
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-xs leading-relaxed text-slate-dim">
              Whole dollars only. A single checkout is capped at $10,000. Your
              ranking is applied when the payment is confirmed — if the board
              moves first, your money is still credited in full and you land on
              whatever rank that total then earns.
            </p>

            <Link
              href={detailsHref}
              className="btn-claim mt-6 block w-full px-4 py-3 text-center text-base"
            >
              Continue with the details
            </Link>
          </>
        ) : (
          <div>
            <h3 className="font-display text-lg font-bold text-ivory">
              That rank cannot be claimed
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-mist">
              {quote.message}
            </p>
            <Link
              href="/"
              className="btn-ghost mt-5 inline-block px-4 py-2.5 text-sm"
            >
              Back to the board
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
