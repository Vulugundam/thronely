import { NextResponse } from "next/server";
import {
  attachSession,
  claimInputFrom,
  discardUnpaidListing,
  prepareCheckout,
} from "@/lib/checkout";
import { createCheckoutSession, stripeOrNull } from "@/lib/stripe";

/**
 * Turning a submitted claim form into a Stripe Checkout.
 *
 * This handler is deliberately thin: pricing, validation and row creation live in
 * `src/lib/checkout.ts` so they are testable without HTTP, and the Stripe
 * specifics live in `src/lib/stripe.ts`. What is left here is the part that is
 * genuinely about HTTP — reading the form, and choosing a status code.
 *
 * ## Why every response is a 303 built by hand
 *
 * A form POST that ends in a browser navigation has to become a GET, or the
 * browser re-POSTs on refresh and charges again. `NextResponse.redirect()`
 * defaults to **307**, which preserves the method — exactly the wrong choice here.
 * So every branch returns an explicit `303` with a `Location`, and none of them
 * uses `redirect()`, which also throws (and so could not sit inside the `try`
 * that wraps the Stripe call).
 *
 * There is no `runtime` export and no `dynamic`/`revalidate`: under
 * `cacheComponents: true` the first is forbidden and the others are removed. POST
 * handlers are never cached, so nothing else is needed.
 */

/** `FormData` values as plain strings, since only text fields are consumed. */
function fieldsFrom(form: FormData): Record<string, string | undefined> {
  const fields: Record<string, string | undefined> = {};
  for (const [key, value] of form.entries()) {
    // A file part is never a claim field; ignoring it keeps the schema strict.
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

/** A 303 to a path or absolute URL, so the follow-up request is a GET. */
function seeOther(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return seeOther("/claim");
  }

  const input = claimInputFrom(fieldsFrom(form));
  if (!input) {
    // Missing or malformed fields. There is no price to re-quote and nowhere
    // sensible to return to, so send them back to the start of the flow.
    return seeOther("/claim");
  }

  const result = await prepareCheckout(input);
  if (!result.ok) {
    // The message rides on the query string because the details page renders it;
    // without it the buyer is bounced to a page that looks identical to the one
    // they left, with no indication of what went wrong.
    const url = new URL(result.redirectTo, request.url);
    url.searchParams.set("error", result.message);
    return seeOther(`${url.pathname}${url.search}`);
  }

  const stripe = stripeOrNull();

  /*
   * No Stripe key configured: hand off to the dev mock, which signs a real event
   * and runs the real webhook path. The product row is already created, so the
   * mock only has to complete what this route began.
   */
  if (!stripe) {
    return seeOther(
      `/api/dev/mock-checkout?bid=${encodeURIComponent(result.bidId)}`,
    );
  }

  try {
    const session = await createCheckoutSession({
      stripe,
      request,
      bidId: result.bidId,
      productSlug: result.productSlug,
      productTitle: `${result.kind === "new" ? "New listing" : "Rank raise"} on Thronely`,
      amountCents: result.deltaCents,
      description: input.description,
      rank: result.rank,
    });

    // Stamped after the fact, which is safe because the webhook resolves by
    // `metadata.bidId` first — this write losing a race to Stripe's first event is
    // exactly the case that metadata exists to cover.
    await attachSession(result.bidId, session.id);

    if (!session.url) {
      throw new Error(`Stripe returned session ${session.id} without a URL.`);
    }

    return seeOther(session.url);
  } catch (error) {
    console.error("[checkout] session creation failed", error);

    /*
     * Stripe refused before any money moved, so a listing that exists only because
     * of this attempt should not linger. Only a brand-new product is removed, and
     * the delete is guarded on it having no money and no paid bids — a raise
     * leaves the existing listing alone.
     */
    if (result.kind === "new") {
      await discardUnpaidListing(result.productId);
    }

    const url = new URL("/claim/details", request.url);
    url.searchParams.set(
      "error",
      "We could not start the payment. Nothing has been charged — please try again.",
    );
    url.searchParams.set("rank", String(result.rank));
    return seeOther(`${url.pathname}${url.search}`);
  }
}

/**
 * A GET here is someone typing the URL, not a browser following the form. Sending
 * them to the start of the claim flow is more useful than a 405.
 */
export function GET(request: Request): NextResponse {
  return seeOther(new URL("/claim", request.url).toString());
}
