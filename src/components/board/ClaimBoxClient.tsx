"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUsd } from "@/lib/pricing";

export type CategoryOption = { slug: string; name: string };

/**
 * The claim box: pick a category, pick a rank, see the exact price, go to
 * checkout.
 *
 * Prices are computed on the server and passed in, so this component never
 * quotes a price itself — the number shown and the number charged come from the
 * same function. The server re-quotes at checkout anyway, because the board can
 * move between page load and payment.
 *
 * Category switching navigates rather than fetching, so the price for the newly
 * chosen board is always server-computed too. The control is a real <form> with
 * a submit button, so it still works with JavaScript unavailable.
 */
export function ClaimBoxClient({
  categories,
  currentCategory,
  currentCategoryName,
  prices,
  leaderTitle,
}: {
  categories: CategoryOption[];
  currentCategory: string;
  currentCategoryName: string;
  /** Index 0 is rank 1. */
  prices: number[];
  leaderTitle: string | null;
}) {
  const router = useRouter();
  const [rank, setRank] = useState(1);

  const selected = prices[rank - 1] ?? prices[prices.length - 1] ?? 0;
  const maxRank = prices.length;

  const claimHref = `/claim?rank=${rank}${
    currentCategory ? `&category=${encodeURIComponent(currentCategory)}` : ""
  }`;

  return (
    <section
      aria-labelledby="claim-box-heading"
      className="glass-strong rounded-card p-5 sm:p-6"
    >
      <h2
        id="claim-box-heading"
        className="font-display text-lg font-bold text-ivory"
      >
        {rank === 1 ? "Claim #1" : `Claim rank ${rank}`} for{" "}
        <span className="rank-numeral">{formatUsd(selected)}</span>
      </h2>

      <p className="mt-1.5 text-sm text-mist">
        {rank === 1
          ? leaderTitle
            ? `Outbids ${leaderTitle} and takes the throne.`
            : "The throne is empty — take it for the minimum."
          : "You only ever pay the difference between this price and what you have already paid."}
      </p>

      <form
        method="get"
        action="/"
        className="mt-5 flex flex-col gap-4"
        onSubmit={(event) => {
          // Let the browser navigate so the server can price the new category.
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const slug = String(data.get("category") ?? "");
          router.push(slug ? `/?category=${encodeURIComponent(slug)}` : "/");
        }}
      >
        <div>
          <label
            htmlFor="claim-category"
            className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim"
          >
            Category
          </label>
          <select
            id="claim-category"
            name="category"
            defaultValue={currentCategory}
            onChange={(event) => {
              const slug = event.currentTarget.value;
              router.push(
                slug ? `/?category=${encodeURIComponent(slug)}` : "/",
              );
            }}
            className="mt-2 w-full rounded-lg border border-white/12 bg-abyss-900 px-3 py-2.5 text-sm text-ivory"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim">
            Target rank
          </span>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRank((r) => Math.max(1, r - 1))}
              disabled={rank <= 1}
              aria-label="Lower target rank number"
              className="btn-ghost h-10 w-10 text-lg leading-none"
            >
              −
            </button>
            <output
              aria-live="polite"
              className="min-w-14 flex-1 text-center font-display text-2xl font-bold text-ivory tabular-nums"
            >
              #{rank}
            </output>
            <button
              type="button"
              onClick={() => setRank((r) => Math.min(maxRank, r + 1))}
              disabled={rank >= maxRank}
              aria-label="Raise target rank number"
              className="btn-ghost h-10 w-10 text-lg leading-none"
            >
              +
            </button>
          </div>
        </div>

        <button type="submit" className="btn-claim w-full px-4 py-3 text-base">
          Claim {currentCategoryName ? `${currentCategoryName} ` : ""}#{rank}
        </button>
      </form>

      <p className="mt-3 text-xs text-slate-dim">
        Claims are priced against the all-time board. Rank only changes once
        payment is confirmed.
      </p>

      {/* Progressive enhancement: without JavaScript the select still submits. */}
      <noscript>
        <a
          href={claimHref}
          className="mt-3 block text-center text-sm text-gold-400 underline"
        >
          Continue to claim #{rank}
        </a>
      </noscript>
    </section>
  );
}
