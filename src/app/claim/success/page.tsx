import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getProductBySlug } from "@/lib/board";
import { getClaimStatus } from "@/lib/checkout";
import { formatUsd } from "@/lib/pricing";
import { firstParam } from "@/lib/search-params";
import { PaymentStackStage } from "@/components/three/SceneMount";

/**
 * Where Stripe sends the buyer back to.
 *
 * The page is a read of the database, never of the redirect: what counts as paid
 * is the `Bid` row the webhook transitioned, not the fact that Stripe returned the
 * browser here. A buyer can land on this URL without the webhook having arrived
 * yet — Stripe's redirect and its webhook are independent — so the "waiting"
 * state is a real state, not an error, and it says so.
 *
 * `noindex` for the same reason `/claim/details` has it: the URL carries a
 * session id, and a payment-confirmation page has no business in a search index.
 *
 * The rank is shown as a rank rather than a number of cents. Money is an input to
 * this board; the position it buys is the product.
 */

export const metadata: Metadata = {
  title: "Claim confirmed",
  description: "The outcome of your claim on the Thronely board.",
  alternates: { canonical: "/claim/success" },
  robots: { index: false, follow: false },
};

function SuccessSkeleton() {
  return (
    <div role="status" aria-label="Loading your claim" className="space-y-6">
      <span className="sr-only">Loading your claim…</span>
      <div className="glass-strong rounded-card p-6">
        <div className="skeleton h-6 w-40 rounded" />
        <div className="skeleton mt-5 h-14 w-56 rounded-lg" />
        <div className="skeleton mt-5 h-5 w-full max-w-md rounded" />
      </div>
    </div>
  );
}

export default function ClaimSuccessPage({
  searchParams,
}: PageProps<"/claim/success">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-14 sm:px-6">
      <Suspense fallback={<SuccessSkeleton />}>
        <SuccessContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * A dead end, rendered the same way whatever caused it.
 *
 * Every failure here is the same from the buyer's point of view — "we cannot show
 * you a confirmation" — and the useful thing is the next step, so they share one
 * shape rather than three near-identical cards.
 */
function Problem({
  heading,
  body,
}: {
  heading: string;
  body: string;
}) {
  return (
    <section className="glass-strong rounded-card p-5 sm:p-6">
      <h1 className="font-display text-2xl font-bold text-ivory">{heading}</h1>
      <p className="mt-3 text-sm leading-relaxed text-mist">{body}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="btn-claim px-4 py-2.5 text-sm">
          See the board
        </Link>
        <Link
          href="/claim"
          className="rounded-lg border border-white/12 px-4 py-2.5 text-sm text-mist transition-colors hover:text-ivory"
        >
          Claim another rank
        </Link>
      </div>
    </section>
  );
}

async function SuccessContent({
  searchParams,
}: Pick<PageProps<"/claim/success">, "searchParams">) {
  const sessionId = firstParam((await searchParams).session_id);

  if (!sessionId) {
    return (
      <Problem
        heading="No payment to show"
        body="This page needs the reference Stripe sends you back with. If you have just paid, check your email receipt or open the link you were given."
      />
    );
  }

  const claim = await getClaimStatus(sessionId);
  if (!claim) {
    return (
      <Problem
        heading="We could not find that payment"
        body="That reference does not match anything on file. It may be from a different environment, or from a checkout that never completed."
      />
    );
  }

  const { bid } = claim;

  /*
   * Confirmed only when the webhook has said so. Landing here proves the browser
   * was redirected; it does not prove money was taken, and treating the two as the
   * same thing is how a page ends up congratulating someone for a payment that
   * failed.
   */
  if (bid.status !== "paid") {
    return (
      <section className="glass-strong rounded-card p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
          {bid.status === "pending" ? "Confirming" : "Not completed"}
        </p>
        <h1 className="mt-3 font-display text-2xl font-bold text-ivory sm:text-3xl">
          {bid.status === "pending"
            ? "Waiting for your payment to confirm"
            : "That payment did not go through"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-mist">
          {bid.status === "pending"
            ? "Your payment processor has not confirmed the charge yet. Nothing is wrong — this normally takes a moment. Refreshing this page is safe; reloading will never charge you twice."
            : "The payment was declined or the checkout expired, and nothing was charged. You can pick the rank up again whenever you like."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/claim/success?session_id=${encodeURIComponent(sessionId)}`}
            className="btn-claim px-4 py-2.5 text-sm"
          >
            Check again
          </Link>
          <Link
            href="/claim"
            className="rounded-lg border border-white/12 px-4 py-2.5 text-sm text-mist transition-colors hover:text-ivory"
          >
            Claim another rank
          </Link>
        </div>
      </section>
    );
  }

  // The rank the money actually bought, derived from the live board rather than
  // from whatever was quoted at checkout — the two can legitimately differ if the
  // board moved while the payment was in flight.
  const listing = await getProductBySlug(bid.product.slug);

  return (
    <div className="space-y-8">
      <section className="glass-strong rounded-card p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">
          Payment confirmed
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ivory sm:text-4xl">
          {listing?.rank ? (
            <>
              Your listing holds{" "}
              <span className="rank-numeral">rank #{listing.rank}</span>
            </>
          ) : (
            <>Your listing is on the board</>
          )}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-mist">
          {formatUsd(bid.amountCents)} was charged for{" "}
          <span className="text-ivory">{bid.product.title}</span>. Rank is
          re-derived from the total paid, so a busier board can move your position
          after the fact — that is the whole game.
        </p>

        <dl className="mt-6 space-y-2 border-t border-white/8 pt-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-dim">Listing</dt>
            <dd className="text-right text-ivory">{bid.product.title}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-dim">Charged</dt>
            <dd className="text-right tabular-nums text-ivory">
              {formatUsd(bid.amountCents)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-dim">Total on this listing</dt>
            <dd className="text-right tabular-nums text-ivory">
              {formatUsd(bid.product.totalPaidCents)}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/product/${bid.product.slug}`}
            className="btn-claim px-4 py-2.5 text-sm"
          >
            View your listing
          </Link>
          <Link
            href="/claim"
            className="rounded-lg border border-white/12 px-4 py-2.5 text-sm text-mist transition-colors hover:text-ivory"
          >
            Claim another rank
          </Link>
        </div>
      </section>

      {/*
       * The 3D flourish for the celebratory moment, reusing the listing page's
       * stack rather than inventing a scene: the segments are this listing's real
       * payments, so the picture is the buyer's own history rather than a
       * congratulation. The 2D twin below it is the same data as text, which is
       * what a crawler and a no-WebGL reader get.
       */}
      {listing && claim.segments.length > 0 ? (
        <section aria-labelledby="paid-heading">
          <h2
            id="paid-heading"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-dim"
          >
            What you have paid so far
          </h2>
          <div className="mt-4">
            <PaymentStackStage
              segments={claim.segments}
              totalCents={listing.product.totalPaidCents}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
