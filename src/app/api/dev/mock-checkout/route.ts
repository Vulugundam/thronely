import { NextResponse } from "next/server";
import { POST as webhookPOST } from "@/app/api/stripe/webhook/route";
import { prisma } from "@/lib/db";
import { markRequestTime } from "@/lib/request-time";
import { signTestEvent } from "@/lib/stripe";

/**
 * A local stand-in for Stripe Checkout, so the money path is provable on a laptop
 * with no Stripe account and no `stripe` CLI.
 *
 * ## It runs the real path, not a shortcut
 *
 * The obvious implementation — call `applyEvent` directly — would skip signature
 * verification, which is the one part of the webhook most likely to be wrong and
 * the one part that cannot be exercised any other way locally. So this builds a
 * genuine event, signs it with the SDK's own signer against the same secret the
 * webhook verifies with, and hands it to the webhook's own `POST` through a real
 * `Request`. Everything runs except the network hop: the raw-body read, the
 * `constructEvent` check, the transaction, the idempotency gates.
 *
 * A self-`fetch()` to the webhook URL was declined in favour of this. It would
 * have depended on the server being able to reach its own origin (port, host, TLS,
 * proxy) and added a round trip whose failure mode is indistinguishable from a
 * real webhook failure — while testing nothing the in-process call does not.
 *
 * ## The event id is derived from the bid, deliberately
 *
 * Reloading this URL re-sends `evt_mock_<bid>`. That is not laziness: it is what
 * makes the idempotency check repeatable by hand. Hitting the same URL twice
 * delivers the *same event id*, the unique gate rejects the second delivery, and
 * the board does not move. A random event id would make the second hit look like a
 * new payment — which is also worth being able to test, but is not what reloading
 * a mock URL should mean.
 *
 * ## Development only
 *
 * The handler 404s under `NODE_ENV === "production"`. It is a literal comparison
 * on a statically inlined value, so the check is also compiled away in a
 * production build: the route is unreachable there by construction, not merely
 * by condition. Two further guards stand behind it — `devWebhookSecret()` throws
 * outside development, and the webhook verifies against `webhookSecret()`, which
 * refuses the development secret in production. The `connection()` call above the
 * guard keeps the route dynamic, so the guard is evaluated per request rather than
 * baked into a build-time prerender; see the note on it in the handler.
 */
export async function GET(request: Request): Promise<Response> {
  /*
   * First, and deliberately above the production guard.
   *
   * Nothing else in this handler reads request-time data before the guard, and a
   * GET handler that never does is classified static — its body is executed at
   * BUILD time and the result baked. That is not hypothetical: it is what this
   * file did before, and the measurement is in the build output (○ against ƒ for
   * the two Stripe routes). The baked response was the production guard's 404,
   * because `next build` sets NODE_ENV=production, so the build was harmless — but
   * only *by accident*, and only for as long as the guard stays the first
   * statement. A build that ran under any other NODE_ENV, or an edit that moved
   * the guard down, would have run this body at build time: querying the database
   * and crediting a payment with no request behind it.
   *
   * `connection()` is what turns that off. It is reached during a prerender, and
   * Next responds by abandoning the prerender and rendering the route per request.
   * The route is then classified dynamic, which is simply true of a GET that
   * mutates the board. Placed here rather than after the guard precisely so the
   * guard cannot stop it being reached.
   */
  await markRequestTime();

  if (process.env.NODE_ENV === "production") {
    return new Response("Not found.", { status: 404 });
  }

  const bidId = new URL(request.url).searchParams.get("bid");
  if (!bidId) {
    return new Response("Missing ?bid=", { status: 400 });
  }

  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    select: {
      id: true,
      amountCents: true,
      status: true,
      product: { select: { slug: true, title: true } },
    },
  });

  if (!bid) {
    return new Response("No such bid.", { status: 404 });
  }

  const sessionId = `cs_mock_${bid.id}`;

  /*
   * Shaped as a real Checkout Session, with only the fields the webhook reads:
   * `payment_status` must be `paid` (a `completed` session can legitimately be
   * unpaid, and the webhook refuses to credit those), `amount_total` is what the
   * credit is booked from, and `metadata.bidId` is what resolves the row.
   */
  const payload = JSON.stringify({
    id: `evt_mock_${bid.id}`,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        currency: "usd",
        amount_total: bid.amountCents,
        metadata: { bidId: bid.id, productSlug: bid.product.slug },
      },
    },
  });

  // A real Request through the real handler: no test double anywhere in the path.
  const response = await webhookPOST(
    new Request(new URL("/api/stripe/webhook", request.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signTestEvent(payload),
      },
      body: payload,
    }),
  );

  if (!response.ok) {
    return new Response(
      `The webhook rejected the mock event (${response.status}). See the server log.`,
      { status: 502 },
    );
  }

  // 303 so the browser follows with a GET, like the real hosted-checkout return.
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/claim/success?session_id=${encodeURIComponent(sessionId)}`,
      // A GET that mutates; make sure nothing along the way caches it.
      "Cache-Control": "no-store",
    },
  });
}
