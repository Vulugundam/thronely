import { applyEvent } from "@/lib/webhook";
import { verifyEvent } from "@/lib/stripe";

/**
 * The Stripe webhook.
 *
 * Deliberately thin: reading the raw body and verifying the signature are the only
 * things that happen here, and everything that touches money lives in
 * `src/lib/webhook.ts` where it can be tested without a signature or a server.
 *
 * ## The raw body must be read exactly once, as text
 *
 * The signature is an HMAC over the *exact bytes* Stripe sent. Parsing the JSON
 * and re-serialising it changes key order and whitespace, and the check then fails
 * for a payload that is perfectly valid. So the body is read with `.text()` and
 * never with `.json()`, and never more than once — a stream cannot be re-read.
 *
 * ## Status codes are the whole retry contract
 *
 * `400` means "this did not come from Stripe, or is malformed" — retrying it would
 * be pointless, so Stripe is told not to. `500` means "we failed" — Stripe
 * retries, which is what should happen when the database is unavailable. And
 * anything the handler legitimately declines to act on still returns `200`, because
 * it *was* handled: the event is recorded in `ProcessedEvent` with a status that
 * says what was decided. A 4xx there would make Stripe retry forever a payment we
 * have already chosen not to credit, and the recorded row is how that becomes
 * visible rather than silent.
 *
 * No `runtime` export — forbidden under `cacheComponents: true`, where
 * `dynamic`/`revalidate`/`fetchCache` are also removed. POST is never cached.
 */
export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header.", { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = verifyEvent(rawBody, signature);
  } catch (error) {
    // A bad signature is not a server fault, so it must not be a 5xx: Stripe would
    // retry a request that can never succeed.
    console.error("[stripe] signature verification failed", error);
    return new Response("Invalid signature.", { status: 400 });
  }

  try {
    const outcome = await applyEvent(event);
    // The outcome is returned for local debugging; Stripe ignores the body.
    return Response.json({ received: true, outcome }, { status: 200 });
  } catch (error) {
    // A genuine failure. 500 so Stripe retries, and the unique-constraint gate
    // makes that retry safe whenever it is the transaction that failed.
    console.error("[stripe] webhook failed", event.id, event.type, error);
    return new Response("Webhook handler failed.", { status: 500 });
  }
}
