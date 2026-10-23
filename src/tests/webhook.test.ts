import { beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { applyEvent, isUniqueViolation } from "@/lib/webhook";
import { signTestEvent, verifyEvent } from "@/lib/stripe";

/**
 * The money path, driven directly.
 *
 * These call `applyEvent` with an already-parsed event, so there is no HTTP and no
 * signature to fake: what is under test is the crediting logic and its two
 * idempotency guards, which is the part that must be right. Signature handling is
 * tested separately, at the bottom, through the real verifier.
 *
 * ## What "concurrent" means here, precisely
 *
 * The SQLite adapter serialises interactive transactions behind a per-client mutex,
 * so two `applyEvent` calls started with `Promise.all` interleave at the JavaScript
 * level but *cannot* have overlapping `BEGIN`…`COMMIT`. The second transaction
 * begins after the first commits and therefore observes its result.
 *
 * That makes this test deterministic and it does prove the invariant — exactly one
 * credit — but it proves it by "the loser saw the committed state", not by lock
 * contention. On Postgres, which has no such mutex, the same code path decides the
 * winner through the unique index and the conditional `updateMany` instead. The
 * invariant is what is asserted either way; interleaving is not, and pretending
 * otherwise in a comment would make the test look like more than it is.
 *
 * The invariant asserted after every sequence is the same one the seed checks and
 * the same one the schema documents:
 *
 *     Product.totalPaidCents === SUM(Bid.amountCents WHERE status = 'paid')
 */

let productId = "";
let bidId = "";

async function reset() {
  // Child rows first: the foreign keys are real and SQLite enforces them.
  await prisma.processedEvent.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  const category = await prisma.category.create({
    data: { slug: "tools", name: "Tools" },
  });

  const product = await prisma.product.create({
    data: {
      slug: "aurelia",
      url: "https://example.com/aurelia",
      title: "Aurelia",
      description: "A listing.",
      categoryId: category.id,
    },
  });
  productId = product.id;

  const bid = await prisma.bid.create({
    data: { productId: product.id, amountCents: 5_000, status: "pending" },
  });
  bidId = bid.id;
}

/**
 * A `checkout.session.completed` event shaped the way the webhook reads it.
 *
 * `payment_status` defaults to `"paid"` because that is the only value the credit
 * path acts on; the tests that care about the other value pass it explicitly.
 */
function completedEvent({
  eventId = "evt_1",
  sessionId = "cs_1",
  amountTotal = 5_000,
  paymentStatus = "paid",
  currency = "usd",
  metadata = { bidId } as Record<string, string | undefined> | null,
  created = 1_800_000_000,
}: {
  eventId?: string;
  sessionId?: string;
  amountTotal?: number | null;
  paymentStatus?: string;
  currency?: string | null;
  metadata?: Record<string, string | undefined> | null;
  created?: number;
} = {}): Stripe.Event {
  const cleanMeta = metadata
    ? Object.fromEntries(
        Object.entries(metadata).filter(([, value]) => value !== undefined),
      )
    : null;

  return {
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    created,
    livemode: false,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: paymentStatus,
        currency,
        amount_total: amountTotal,
        metadata: cleanMeta,
      },
    },
  } as unknown as Stripe.Event;
}

function expiredEvent({
  eventId = "evt_exp",
  sessionId = "cs_1",
  metadata = { bidId } as Record<string, string | undefined> | null,
  created = 1_800_000_100,
}: {
  eventId?: string;
  sessionId?: string;
  metadata?: Record<string, string | undefined> | null;
  created?: number;
} = {}): Stripe.Event {
  return {
    id: eventId,
    object: "event",
    type: "checkout.session.expired",
    created,
    livemode: false,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        metadata,
      },
    },
  } as unknown as Stripe.Event;
}

function paymentFailedEvent({
  eventId = "evt_pf",
  metadata = { bidId } as Record<string, string | undefined> | null,
  created = 1_800_000_200,
}: {
  eventId?: string;
  metadata?: Record<string, string | undefined> | null;
  created?: number;
} = {}): Stripe.Event {
  return {
    id: eventId,
    object: "event",
    type: "payment_intent.payment_failed",
    created,
    livemode: false,
    data: {
      object: { id: "pi_1", object: "payment_intent", metadata },
    },
  } as unknown as Stripe.Event;
}

/** The invariant: every product's total is exactly its paid bids. */
async function expectInvariant() {
  const products = await prisma.product.findMany({
    select: { id: true, totalPaidCents: true },
  });
  const grouped = await prisma.bid.groupBy({
    by: ["productId"],
    where: { status: "paid" },
    _sum: { amountCents: true },
  });
  const paidByProduct = new Map(
    grouped.map((g) => [g.productId, g._sum.amountCents ?? 0]),
  );

  for (const product of products) {
    expect(product.totalPaidCents).toBe(paidByProduct.get(product.id) ?? 0);
  }
}

async function productTotal() {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { totalPaidCents: true, lastBidAt: true },
  });
  return product;
}

async function paidBids() {
  return prisma.bid.findMany({ where: { productId, status: "paid" } });
}

beforeEach(reset);

describe("crediting a payment", () => {
  it("credits exactly once on first delivery", async () => {
    const outcome = await applyEvent(
      completedEvent({ amountTotal: 5_000, metadata: { bidId } }),
    );

    expect(outcome).toEqual({
      status: "credited",
      productId,
      amountCents: 5_000,
      bidId,
    });

    const bid = await prisma.bid.findUnique({ where: { id: bidId } });
    expect(bid?.status).toBe("paid");
    expect(bid?.amountCents).toBe(5_000);
    expect(bid?.paidAt).toBeInstanceOf(Date);
    // The session id is backfilled by the credit, which is what lets a later
    // metadata-less event for the same session still find this row.
    expect(bid?.stripeSessionId).toBe("cs_1");

    expect((await productTotal())?.totalPaidCents).toBe(5_000);
    expect(await prisma.processedEvent.count()).toBe(1);
    await expectInvariant();
  });

  it("changes nothing when the identical event is redelivered", async () => {
    const event = completedEvent({ metadata: { bidId } });

    await applyEvent(event);
    const replay = await applyEvent(event);

    expect(replay).toEqual({ status: "replay", eventId: "evt_1" });
    expect((await productTotal())?.totalPaidCents).toBe(5_000);
    expect(await paidBids()).toHaveLength(1);
    // One row, not two: the duplicate never committed.
    expect(await prisma.processedEvent.count()).toBe(1);
    await expectInvariant();
  });

  it("credits exactly once when two identical deliveries race", async () => {
    const event = completedEvent({ metadata: { bidId } });

    const outcomes = await Promise.all([applyEvent(event), applyEvent(event)]);

    const credited = outcomes.filter((o) => o.status === "credited");
    const replayed = outcomes.filter((o) => o.status === "replay");
    expect(credited).toHaveLength(1);
    expect(replayed).toHaveLength(1);

    expect((await productTotal())?.totalPaidCents).toBe(5_000);
    expect(await paidBids()).toHaveLength(1);
    expect(await prisma.processedEvent.count()).toBe(1);
    await expectInvariant();
  });

  it("credits once when two different events carry the same session", async () => {
    // The realistic version: `completed` and `async_payment_succeeded` for one
    // session, or a manually re-sent event. Different ids, so the unique gate does
    // not fire and the compare-and-swap is the only thing standing between this
    // and a double credit.
    const first = completedEvent({ eventId: "evt_a", metadata: { bidId } });
    const second = completedEvent({ eventId: "evt_b", metadata: { bidId } });

    const outcomes = await Promise.all([applyEvent(first), applyEvent(second)]);

    expect(outcomes.filter((o) => o.status === "credited")).toHaveLength(1);
    expect((await productTotal())?.totalPaidCents).toBe(5_000);
    expect(await paidBids()).toHaveLength(1);
    /*
     * Two rows, and that is the point: the loser of the race is recorded rather
     * than rolled back. Rolling back would discard the evidence that a second
     * event for this session was seen and deliberately ignored.
     */
    expect(await prisma.processedEvent.count()).toBe(2);
    await expectInvariant();
  });

  it("credits the amount actually paid, not the quoted amount", async () => {
    // Quoted 5000 at checkout; Stripe collected 6000. The bid must reflect what
    // was taken, and the product total must follow it.
    const outcome = await applyEvent(
      completedEvent({ amountTotal: 6_000, metadata: { bidId } }),
    );

    expect(outcome).toEqual({
      status: "credited",
      productId,
      amountCents: 6_000,
      bidId,
    });
    const bid = await prisma.bid.findUnique({ where: { id: bidId } });
    expect(bid?.amountCents).toBe(6_000);
    expect((await productTotal())?.totalPaidCents).toBe(6_000);

    const event = await prisma.processedEvent.findUnique({
      where: { stripeEventId: "evt_1" },
      select: { status: true, detail: true },
    });
    expect(event?.status).toBe("done");
    // Recorded, not hidden: being able to find a charge that differed from its
    // quote is worth a note on the row.
    expect(event?.detail).toContain("6000");
    await expectInvariant();
  });

  it("resolves by metadata when the session id was never stamped on the bid", async () => {
    // The race this exists for: Stripe's event arrives before the checkout route
    // has written `stripeSessionId` back onto the row.
    const bid = await prisma.bid.findUnique({ where: { id: bidId } });
    expect(bid?.stripeSessionId).toBeNull();

    const outcome = await applyEvent(
      completedEvent({ sessionId: "cs_late", metadata: { bidId } }),
    );

    expect(outcome.status).toBe("credited");
    const after = await prisma.bid.findUnique({ where: { id: bidId } });
    expect(after?.status).toBe("paid");
    expect(after?.stripeSessionId).toBe("cs_late");
    await expectInvariant();
  });

  it("does not move lastBidAt backwards for an older payment", async () => {
    // A later payment arrives first, then an earlier one. The tiebreak must not
    // be rewritten by the late-arriving older event.
    const newer = completedEvent({
      eventId: "evt_newer",
      sessionId: "cs_newer",
      amountTotal: 5_000,
      metadata: { bidId },
      created: 1_800_000_500,
    });
    await applyEvent(newer);
    const afterNewer = await productTotal();

    const secondBid = await prisma.bid.create({
      data: { productId, amountCents: 5_000, status: "pending" },
    });
    const older = completedEvent({
      eventId: "evt_older",
      sessionId: "cs_older",
      amountTotal: 5_000,
      metadata: { bidId: secondBid.id },
      created: 1_800_000_100,
    });
    await applyEvent(older);

    const after = await productTotal();
    expect(after?.lastBidAt?.getTime()).toBe(afterNewer?.lastBidAt?.getTime());
    expect(after?.totalPaidCents).toBe(10_000);
    await expectInvariant();
  });
});

describe("refusing to credit", () => {
  it("waits rather than crediting an unpaid completed session", async () => {
    // A delayed payment method: the buyer finished, the money has not arrived.
    const outcome = await applyEvent(
      completedEvent({ paymentStatus: "unpaid", metadata: { bidId } }),
    );

    expect(outcome.status).toBe("ignored");
    expect((await productTotal())?.totalPaidCents).toBe(0);
    expect(await paidBids()).toHaveLength(0);

    const event = await prisma.processedEvent.findUnique({
      where: { stripeEventId: "evt_1" },
      select: { status: true },
    });
    expect(event?.status).toBe("ignored");
    await expectInvariant();
  });

  it("records but does not credit a zero amount", async () => {
    const outcome = await applyEvent(
      completedEvent({ amountTotal: 0, metadata: { bidId } }),
    );

    expect(outcome.status).toBe("needs_review");
    expect((await productTotal())?.totalPaidCents).toBe(0);

    const event = await prisma.processedEvent.findUnique({
      where: { stripeEventId: "evt_1" },
      select: { status: true },
    });
    expect(event?.status).toBe("needs_review");
    await expectInvariant();
  });

  it("refuses to credit a non-USD amount as if it were cents", async () => {
    const outcome = await applyEvent(
      completedEvent({ currency: "eur", metadata: { bidId } }),
    );

    expect(outcome.status).toBe("needs_review");
    expect((await productTotal())?.totalPaidCents).toBe(0);

    const event = await prisma.processedEvent.findUnique({
      where: { stripeEventId: "evt_1" },
      select: { status: true },
    });
    expect(event?.status).toBe("needs_review");
  });

  it("records an unknown session as unmatched and credits nothing", async () => {
    const outcome = await applyEvent(
      completedEvent({ sessionId: "cs_ghost", metadata: null }),
    );

    expect(outcome.status).toBe("unmatched");
    expect((await productTotal())?.totalPaidCents).toBe(0);

    const event = await prisma.processedEvent.findUnique({
      where: { stripeEventId: "evt_1" },
      select: { status: true, detail: true },
    });
    expect(event?.status).toBe("unmatched");
    // The session id on the row is what makes this findable later.
    expect(event?.detail).toContain("cs_ghost");
    await expectInvariant();
  });

  it("records an unknown event type as ignored, and once only", async () => {
    const event = {
      id: "evt_other",
      object: "event",
      type: "customer.created",
      created: 1_800_000_000,
      livemode: false,
      data: { object: { id: "cus_1", object: "customer" } },
    } as unknown as Stripe.Event;

    const outcome = await applyEvent(event);
    expect(outcome).toEqual({
      status: "ignored",
      type: "customer.created",
      detail: "No handler for this event type.",
    });

    // Redelivering it is still a redelivery.
    const replay = await applyEvent(event);
    expect(replay).toEqual({ status: "replay", eventId: "evt_other" });
    expect(await prisma.processedEvent.count()).toBe(1);
  });
});

describe("failing a payment", () => {
  it("marks the bid failed on an expired session, without crediting", async () => {
    const outcome = await applyEvent(expiredEvent({ sessionId: "cs_1" }));

    expect(outcome).toEqual({ status: "failed", bidId });
    const bid = await prisma.bid.findUnique({ where: { id: bidId } });
    expect(bid?.status).toBe("failed");
    expect((await productTotal())?.totalPaidCents).toBe(0);
    expect(await paidBids()).toHaveLength(0);
    await expectInvariant();
  });

  it("marks the bid failed on a declined payment intent", async () => {
    const outcome = await applyEvent(paymentFailedEvent());

    expect(outcome).toEqual({ status: "failed", bidId });
    const bid = await prisma.bid.findUnique({ where: { id: bidId } });
    expect(bid?.status).toBe("failed");
    expect((await productTotal())?.totalPaidCents).toBe(0);
    await expectInvariant();
  });

  it("still credits when the buyer retried in a session that had failed", async () => {
    /*
     * The case that makes the credit CAS `status: { not: "paid" }` rather than
     * `status: "pending"`. A declined attempt leaves the session open, the buyer
     * retries in it, and it then completes. If the credit only matched `pending`,
     * this money would be collected and never credited.
     */
    await applyEvent(expiredEvent({ eventId: "evt_fail", sessionId: "cs_1" }));
    expect((await prisma.bid.findUnique({ where: { id: bidId } }))?.status).toBe(
      "failed",
    );

    const outcome = await applyEvent(
      completedEvent({ eventId: "evt_retry", sessionId: "cs_1", metadata: { bidId } }),
    );

    expect(outcome.status).toBe("credited");
    expect((await prisma.bid.findUnique({ where: { id: bidId } }))?.status).toBe(
      "paid",
    );
    expect((await productTotal())?.totalPaidCents).toBe(5_000);
    await expectInvariant();
  });

  it("never un-credits a paid bid with a late failure event", async () => {
    await applyEvent(completedEvent({ eventId: "evt_paid", metadata: { bidId } }));

    // A failure event for the same session, arriving after the money landed.
    const outcome = await applyEvent(
      expiredEvent({ eventId: "evt_late_fail", sessionId: "cs_1" }),
    );

    // Nothing pending to fail, so it is recorded and changes nothing.
    expect(outcome.status).toBe("ignored");
    expect((await prisma.bid.findUnique({ where: { id: bidId } }))?.status).toBe(
      "paid",
    );
    expect((await productTotal())?.totalPaidCents).toBe(5_000);
    await expectInvariant();
  });

  it("records an expiry for an unknown session as ignored, crediting nothing", async () => {
    // Every `checkout.session.expired` carries a session id, so the lookup is
    // always answerable — there is simply nothing pending to fail. That is a
    // different statement from "unrecognised", and the detail says which.
    const outcome = await applyEvent(
      expiredEvent({ sessionId: "cs_nobody", metadata: null }),
    );

    expect(outcome).toEqual({
      status: "ignored",
      type: "checkout.session.expired",
      detail: "Nothing pending to fail for checkout.session.expired.",
    });
    expect(await prisma.processedEvent.count()).toBe(1);
  });

  it("records a failure with nothing to identify as unmatched", async () => {
    // A payment intent carries no session, so with no metadata there is genuinely
    // nothing to look up — the only path that reaches the unmatched branch.
    const outcome = await applyEvent(paymentFailedEvent({ metadata: null }));

    expect(outcome.status).toBe("unmatched");
    const event = await prisma.processedEvent.findUnique({
      where: { stripeEventId: "evt_pf" },
      select: { status: true, detail: true },
    });
    expect(event?.status).toBe("unmatched");
    expect(event?.detail).toContain("payment_intent.payment_failed");
    expect((await productTotal())?.totalPaidCents).toBe(0);
  });
});

describe("the sequence the plan asks for", () => {
  it("moves the board once and then stops moving", async () => {
    const event = completedEvent({ amountTotal: 5_000, metadata: { bidId } });

    await applyEvent(event);
    const first = await productTotal();
    expect(first?.totalPaidCents).toBe(5_000);

    // The replay.
    const replay = await applyEvent(event);
    expect(replay.status).toBe("replay");

    const second = await productTotal();
    expect(second?.totalPaidCents).toBe(first?.totalPaidCents);
    expect(second?.lastBidAt?.getTime()).toBe(first?.lastBidAt?.getTime());
    expect(await paidBids()).toHaveLength(1);
    expect(await prisma.processedEvent.count()).toBe(1);
    await expectInvariant();
  });
});

describe("isUniqueViolation", () => {
  it("identifies a P2002 by code, without relying on the class", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("P2002")).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
  });
});

describe("signature verification", () => {
  const payload = JSON.stringify({ id: "evt_sig", type: "ping" });

  it("accepts a signature the SDK's own signer produced", () => {
    const event = verifyEvent(payload, signTestEvent(payload));
    expect(event.id).toBe("evt_sig");
  });

  it("rejects a missing signature", () => {
    expect(() => verifyEvent(payload, null)).toThrow(/Missing/);
  });

  it("rejects a tampered payload", () => {
    const signature = signTestEvent(payload);
    expect(() => verifyEvent(`${payload} `, signature)).toThrow();
  });

  it("rejects a signature made with a different secret", () => {
    // A signature that is structurally valid but signed with the wrong key is the
    // interesting case: it proves the check is the secret and not the shape.
    expect(() => verifyEvent(payload, "t=1,v1=deadbeef")).toThrow();
  });
});
