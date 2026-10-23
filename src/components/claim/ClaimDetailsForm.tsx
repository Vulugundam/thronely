"use client";

import { useId, useState } from "react";
import { formatUsd } from "@/lib/pricing";
import {
  MAX_TITLE_LENGTH,
  normaliseText,
  normaliseUrl,
} from "@/lib/listing";

export type CategoryOption = { slug: string; name: string };

export type PaymentSummary = {
  rank: number;
  deltaCents: number;
  rankPriceCents: number;
  currentTotalCents: number;
};

/**
 * Step two of a claim: the listing's own fields, then off to checkout.
 *
 * The price is rendered from server-passed numbers and is not recomputed here.
 * The submit is a plain form POST to the checkout route so it works without
 * JavaScript; the client-side validation above it is only for a faster error.
 */
export function ClaimDetailsForm({
  categories,
  defaultCategory,
  payment,
  maxDescriptionLength,
  existing,
}: {
  categories: CategoryOption[];
  defaultCategory: string;
  payment: PaymentSummary;
  maxDescriptionLength: number;
  existing: {
    slug: string;
    url: string;
    title: string;
    description: string;
  } | null;
}) {
  const descriptionId = useId();
  const [description, setDescription] = useState(
    existing ? normaliseText(existing.description, maxDescriptionLength) : "",
  );
  const [url, setUrl] = useState(existing?.url ?? "");

  const remaining = maxDescriptionLength - description.length;
  const urlLooksValid = existing !== null || normaliseUrl(url) !== null;

  return (
    <div className="space-y-6">
      <form
        method="post"
        action="/api/stripe/checkout"
        className="space-y-6"
        onSubmit={(event) => {
          // Guard the two client-visible problems before the network round trip.
          // The server validates all of this again regardless.
          if (!urlLooksValid) {
            event.preventDefault();
            return;
          }
          const submitter = (event.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          if (submitter) {
            submitter.disabled = true;
            submitter.textContent = "Opening checkout…";
          }
        }}
      >
        <input type="hidden" name="rank" value={payment.rank} />

        <section
          aria-labelledby="listing-heading"
          className="glass-strong rounded-card p-5 sm:p-6"
        >
          <h2
            id="listing-heading"
            className="font-display text-lg font-bold text-ivory"
          >
            The listing
          </h2>

          {existing ? (
            <>
              <input type="hidden" name="productSlug" value={existing.slug} />
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-dim">Listing</dt>
                  <dd className="text-right text-ivory">{existing.title}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-dim">Destination</dt>
                  <dd className="max-w-sm truncate text-right text-ivory">
                    {existing.url}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <div className="mt-5">
                <label
                  htmlFor="listing-url"
                  className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim"
                >
                  Destination URL
                </label>
                <input
                  id="listing-url"
                  name="url"
                  type="url"
                  required
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(event) => setUrl(event.currentTarget.value)}
                  aria-invalid={url.length > 0 && !urlLooksValid}
                  aria-describedby="listing-url-hint"
                  className="mt-2 w-full rounded-lg border border-white/12 bg-abyss-900 px-3 py-2.5 text-sm text-ivory placeholder:text-slate-dim/60"
                />
                <p id="listing-url-hint" className="mt-2 text-xs text-slate-dim">
                  {url.length > 0 && !urlLooksValid
                    ? "That does not look like an http or https address."
                    : "Where a visitor lands when they click your listing."}
                </p>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="listing-title"
                  className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim"
                >
                  Title
                </label>
                <input
                  id="listing-title"
                  name="title"
                  type="text"
                  required
                  maxLength={MAX_TITLE_LENGTH}
                  placeholder="What the listing is called"
                  className="mt-2 w-full rounded-lg border border-white/12 bg-abyss-900 px-3 py-2.5 text-sm text-ivory placeholder:text-slate-dim/60"
                />
              </div>

              <div className="mt-5">
                <label
                  htmlFor="listing-category"
                  className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim"
                >
                  Category
                </label>
                <select
                  id="listing-category"
                  name="category"
                  required
                  defaultValue={defaultCategory}
                  className="mt-2 w-full rounded-lg border border-white/12 bg-abyss-900 px-3 py-2.5 text-sm text-ivory"
                >
                  <option value="" disabled>
                    Pick a category
                  </option>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="mt-5">
            <label
              htmlFor={descriptionId}
              className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-dim"
            >
              Description
            </label>
            <textarea
              id={descriptionId}
              name="description"
              required
              rows={3}
              maxLength={maxDescriptionLength}
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              aria-describedby={`${descriptionId}-count`}
              className="mt-2 w-full resize-y rounded-lg border border-white/12 bg-abyss-900 px-3 py-2.5 text-sm leading-relaxed text-ivory"
            />
            <p
              id={`${descriptionId}-count`}
              className="mt-2 text-xs text-slate-dim"
            >
              <span
                className={
                  remaining < 20 ? "text-violet-300" : "text-slate-dim"
                }
              >
                {remaining}
              </span>{" "}
              characters left
            </p>
          </div>
        </section>

        <section
          aria-labelledby="pay-heading"
          className="glass-strong rounded-card p-5 sm:p-6"
        >
          <h2 id="pay-heading" className="sr-only">
            Payment
          </h2>

          <div className="flex items-baseline justify-between gap-4">
            <span className="font-display text-base font-bold text-ivory">
              Total charge
            </span>
            <span className="rank-numeral font-display text-4xl font-bold tabular-nums">
              {formatUsd(payment.deltaCents)}
            </span>
          </div>
          <p className="mt-2 text-sm text-mist">
            Takes rank #{payment.rank}, priced at{" "}
            {formatUsd(payment.rankPriceCents)}
            {payment.currentTotalCents > 0
              ? `, less the ${formatUsd(payment.currentTotalCents)} already paid.`
              : "."}
          </p>

          <button type="submit" className="btn-claim mt-6 w-full px-4 py-3 text-base">
            Continue to payment
          </button>

          <p className="mt-3 text-xs leading-relaxed text-slate-dim">
            You will be sent to our payment processor. The charge is a one-time
            payment — nothing recurs, and we never see your card. Rank is applied
            when the payment is confirmed.
          </p>
        </section>
      </form>

      {/* Reassurance that the rank survives the trip, since the price is
          re-derived at checkout time. */}
      <p className="text-xs leading-relaxed text-slate-dim">
        By continuing you agree to the{" "}
        <a
          href="/terms"
          className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
        >
          terms
        </a>{" "}
        and the{" "}
        <a
          href="/refunds"
          className="text-gold-400 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-300"
        >
          refund policy
        </a>
        .
      </p>
    </div>
  );
}
