import type Stripe from "stripe";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";

/**
 * Applying a verified Stripe event to the board.
 *
 * This is a plain function over an already-verified event rather than logic
 * inside the route handler, for one reason: the money path is the part of this
 * application that must not be wrong, and it has to be testable without a
 * network, a signature, or a running server. The route handler does nothing but
 * read the raw body, verify it, and call this.
 *
 * ## Why money cannot be credited twice
 *
 * Two different things can be delivered twice, so there are two different
 * guards, and they are deliberately not the same mechanism:
 *
 * 1. **The same event, redelivered.** Stripe retries, and retries can overlap.
 *    `ProcessedEvent.stripeEventId` is unique, so the second insert fails with
 *    `P2002` and the whole transaction rolls back. That is event-level
 *    idempotency, and it is race-safe by construction — a read-then-check would
 *    have both callers see "absent" and both proceed.
 * 2. **Different events for the same payment.** A retry can arrive as a new
 *    event id, and `checkout.session.completed` and
 *    `checkout.session.async_payment_succeeded` can both fire for one session. So
 *    crediting is a compare-and-swap — `updateMany` with a `status` condition in
 *    the WHERE clause — not a read followed by a write. Exactly one caller can
 *    match that row; the loser matches zero rows and credits nothing.
 *
 * The credit itself is an atomic `{ increment }`, never a read-modify-write, so
 * two *different* payments landing at once cannot lose an update either.
 *
 * ## The two CAS conditions are deliberately different
 *
 * Crediting matches `status: { not: "paid" }`, failing matches
 * `status: "pending"`. The asymmetry is the whole design:
 *
 * - A session that was declined *stays open*. The buyer retries in the same
 *   session, and it later completes. If the failure handler had set the bid to
 *   `failed` and the credit only matched `pending`, that money would be taken and
 *   never credited — the one direction of error that is unacceptable. So credit
 *   accepts anything not already paid.
 * - The failure handler keeps the narrow `pending` condition, so a late failure
 *   event can never un-credit a bid that was already paid.
 *
 * ## What is trusted
 *
 * The amount credited is the amount Stripe says was actually paid. The
 * checkout-time quote is never trusted for the credit: rank is re-derived from
 * `totalPaidCents` everywhere, so if the board moved between the quote and the
 * payment, the money still lands in full and the product simply shows whatever
 * rank its new total earns. That is the honest behaviour, and it is what the
 * claim form tells the buyer will happen.
 */

/**
 * Explicit transaction bounds.
 *
 * The SQLite adapter serialises transactions behind a per-client mutex, and the
 * wait for that mutex counts against `maxWait` (2s by default) — so a burst of
 * Stripe retries could otherwise reject with `P2024` rather than queue. No
 * `isolationLevel` is passed: the SQLite adapter throws for anything but
 * SERIALIZABLE.
 */
const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

/** How an event was settled. Every value except `replay` is a commit. */
export type ApplyOutcome =
  | { status: "credited"; productId: string; amountCents: number; bidId: string }
  | { status: "failed"; bidId: string }
  | { status: "replay"; eventId: string }
  | { status: "ignored"; type: string; detail: string }
  | { status: "unmatched"; detail: string }
  | { status: "needs_review"; detail: string };

/**
 * Read the bid id a session or payment intent points at.
 *
 * Set at session creation via both `metadata` and `payment_intent_data.metadata`,
 * so a `payment_intent.*` event — which carries no session — can still be tied
 * back to the row it belongs to.
 */
function bidIdFrom(metadata: Stripe.Metadata | null | undefined): string | null {
  const value = metadata?.bidId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * When the money actually moved.
 *
 * Taken from the event's own timestamp rather than `new Date()`, so a replay
 * computes an identical value and the Today board cannot be moved by a retry.
 * Stripe timestamps are second-granular, which is why the rank comparator needs
 * its `id` tiebreak.
 */
function paidAtFrom(event: Stripe.Event): Date {
  return new Date(event.created * 1000);
}

/**
 * A unique-constraint violation — the only replay signal that is race-safe.
 *
 * Matched on the `code` string rather than via `instanceof`, because a bundled
 * server build can end up with two copies of the error class and `instanceof`
 * would then silently return false for a genuine violation. `code` is the
 * contract the generated client promises across versions.
 */
export function isUniqueViolation(error: unknown): error is { code: "P2002" } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Record the event as processed, or throw if it has already been seen.
 *
 * Must be the first statement in the transaction. If it is not, work could be
 * committed before the duplicate is detected.
 */
async function claimEvent(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
  status: string,
  detail: string | null,
): Promise<void> {
  await tx.processedEvent.create({
    data: { stripeEventId: event.id, type: event.type, status, detail },
  });
}

/**
 * Claim the event and record an outcome that changes nothing else.
 *
 * Used for every branch that does not credit: an unmatched payment, an amount we
 * cannot read as cents, an event type with no handler. These **commit** rather
 * than roll back, which is the point — rolling back would discard the record that
 * makes the event answerable later, and an unmatched payment is exactly the thing
 * that must be discoverable rather than merely logged. The row is cheap and the
 * question it answers ("did we ever see this?") is not.
 */
async function recordOnly(
  event: Stripe.Event,
  status: string,
  detail: string,
): Promise<ApplyOutcome> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await claimEvent(tx, event, status, detail);
      },
      TX_OPTIONS,
    );
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "replay", eventId: event.id };
    throw error;
  }

  if (status === "unmatched") return { status: "unmatched", detail };
  if (status === "needs_review") return { status: "needs_review", detail };
  return { status: "ignored", type: event.type, detail };
}

/**
 * Credit a completed, actually-paid checkout session.
 *
 * The order inside the transaction matters: claim the event, resolve the bid,
 * take it with the CAS, then credit the product by the amount just written to
 * that bid. Crediting last means the amount incremented and the amount recorded
 * are read from the same write, so the two can never disagree.
 */
async function creditSession(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<ApplyOutcome> {
  const sessionId = session.id;
  const amount = session.amount_total;
  const metadataBidId = bidIdFrom(session.metadata);

  /*
   * A `completed` session is not necessarily a paid one. For delayed payment
   * methods Stripe fires `checkout.session.completed` as soon as the buyer is
   * done, with `payment_status: "unpaid"`, and only later emits
   * `checkout.session.async_payment_succeeded`. Crediting on the first event
   * would hand over rank for money that has not arrived, so the branch waits.
   * The later event carries the same metadata and lands in the same place.
   */
  if (session.payment_status !== "paid") {
    return recordOnly(
      event,
      "ignored",
      `Session ${sessionId} completed with payment_status=${session.payment_status}; waiting for the payment to settle.`,
    );
  }

  // `amount_total` is typed `number | null`, and a non-integer would break the
  // whole-dollars invariant the rest of the pricing code asserts.
  if (amount === null || !Number.isInteger(amount) || amount <= 0) {
    return recordOnly(
      event,
      "needs_review",
      `Session ${sessionId} completed with amount_total=${String(amount)}; nothing was credited.`,
    );
  }

  // Stripe reports the smallest unit of the session's currency. Only USD's
  // smallest unit is a cent, so crediting anything else would store a number
  // that means something different from what the column claims.
  if (session.currency !== null && session.currency.toLowerCase() !== "usd") {
    return recordOnly(
      event,
      "needs_review",
      `Session ${sessionId} was charged in ${session.currency}; its amount is not a cent value.`,
    );
  }

  const paidAt = paidAtFrom(event);

  try {
    return await prisma.$transaction(async (tx) => {
      await claimEvent(tx, event, "done", null);

      /*
       * Resolve by metadata first, session second.
       *
       * The bid row is created at checkout *before* the session exists, and the
       * session id is stamped on afterwards. If Stripe's first event arrived in
       * that gap, a session-only lookup would find nothing and book real money as
       * `unmatched` while the bid sat `pending` forever. `metadata.bidId` is set
       * on the session at creation, so it is present from the first event and
       * cannot race. The session lookup stays as the fallback for events that
       * carry no metadata.
       */
      const bid = metadataBidId
        ? await tx.bid.findUnique({
            where: { id: metadataBidId },
            select: { id: true, productId: true, amountCents: true },
          })
        : await tx.bid.findUnique({
            where: { stripeSessionId: sessionId },
            select: { id: true, productId: true, amountCents: true },
          });

      if (!bid) {
        const detail = `No bid row for session ${sessionId}.`;
        await tx.processedEvent.update({
          where: { stripeEventId: event.id },
          data: { status: "unmatched", detail },
        });
        return { status: "unmatched", detail } as const;
      }

      // The compare-and-swap. Anything not already paid can be taken — including
      // a bid a declined attempt had marked `failed`.
      const claimed = await tx.bid.updateMany({
        where: { id: bid.id, status: { not: "paid" } },
        data: {
          status: "paid",
          paidAt,
          // The amount actually collected, not the quote. Written once, here.
          amountCents: amount,
        },
      });

      if (claimed.count === 0) {
        // A different event already credited this bid. Nothing to do, but the
        // event itself is still recorded so a redelivery of *it* is a no-op too.
        const detail = `Session ${sessionId} was already credited.`;
        await tx.processedEvent.update({
          where: { stripeEventId: event.id },
          data: { status: "ignored", detail },
        });
        return { status: "replay", eventId: event.id } as const;
      }

      // Backfill the session id for the gap case above. Guarded on null, so this
      // can never collide with the unique index on another row.
      await tx.bid.updateMany({
        where: { id: bid.id, stripeSessionId: null },
        data: { stripeSessionId: sessionId },
      });

      // Atomic increment on the amount just written to the bid, so
      // totalPaidCents === SUM(paid bids) holds even under concurrent payments.
      await tx.product.update({
        where: { id: bid.productId },
        data: { totalPaidCents: { increment: amount } },
      });

      /*
       * `lastBidAt` is a rank tiebreak, and Stripe does not guarantee delivery
       * order: two sessions for one product can be applied oldest-last. Moving it
       * backwards would silently rewrite who is ahead, so it only ever moves
       * forward.
       */
      await tx.product.updateMany({
        where: {
          id: bid.productId,
          OR: [{ lastBidAt: null }, { lastBidAt: { lt: paidAt } }],
        },
        data: { lastBidAt: paidAt },
      });

      // Still `done` — the credit is correct either way; this records that the
      // collected amount differed from the quote, which is worth being able to
      // find later.
      if (amount !== bid.amountCents) {
        await tx.processedEvent.update({
          where: { stripeEventId: event.id },
          data: {
            detail: `Charged ${amount} against a quote of ${bid.amountCents}.`,
          },
        });
      }

      return {
        status: "credited",
        productId: bid.productId,
        amountCents: amount,
        bidId: bid.id,
      } as const;
    }, TX_OPTIONS);
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Seen before. Nothing was committed, so nothing was credited twice.
      return { status: "replay", eventId: event.id };
    }
    throw error;
  }
}

/**
 * Mark a bid failed — an expired session or a declined payment.
 *
 * Never credits, and only ever takes a `pending` bid: a late failure for a
 * session that was retried and paid must not downgrade a real payment.
 */
async function failBid(
  event: Stripe.Event,
  sessionId: string | null,
  metadataBidId: string | null,
): Promise<ApplyOutcome> {
  const where = metadataBidId
    ? { id: metadataBidId, status: "pending" }
    : sessionId
      ? { stripeSessionId: sessionId, status: "pending" }
      : null;

  if (!where) {
    return recordOnly(
      event,
      "unmatched",
      `${event.type} carried no bid and no session to identify it.`,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await claimEvent(tx, event, "done", null);

      const failed = await tx.bid.updateMany({
        where,
        data: { status: "failed" },
      });

      if (failed.count === 0) {
        const detail = `Nothing pending to fail for ${event.type}.`;
        await tx.processedEvent.update({
          where: { stripeEventId: event.id },
          data: { status: "ignored", detail },
        });
        return { status: "ignored", type: event.type, detail } as const;
      }

      const bid = await tx.bid.findFirst({
        where: { ...where, status: "failed" },
        select: { id: true },
      });

      return { status: "failed", bidId: bid?.id ?? metadataBidId ?? "" } as const;
    }, TX_OPTIONS);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: "replay", eventId: event.id };
    }
    throw error;
  }
}

/**
 * Apply one verified event.
 *
 * Unknown event types are recorded as `ignored` rather than dropped: knowing what
 * Stripe sent and that we did nothing about it is worth a row, and it makes "why
 * did this payment not credit?" answerable from the database. Recording goes
 * through the same `ProcessedEvent` gate, so an unhandled type redelivered is
 * still recognised as a replay.
 */
export async function applyEvent(event: Stripe.Event): Promise<ApplyOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    // Delayed payment methods settle here rather than at `completed`. Same
    // session, same metadata, same credit path.
    case "checkout.session.async_payment_succeeded":
      return creditSession(event, event.data.object);

    case "checkout.session.expired":
      return failBid(
        event,
        event.data.object.id,
        bidIdFrom(event.data.object.metadata),
      );

    case "checkout.session.async_payment_failed":
      return failBid(
        event,
        event.data.object.id,
        bidIdFrom(event.data.object.metadata),
      );

    case "payment_intent.payment_failed":
      return failBid(event, null, bidIdFrom(event.data.object.metadata));

    default:
      return recordOnly(
        event,
        "ignored",
        "No handler for this event type.",
      );
  }
}
