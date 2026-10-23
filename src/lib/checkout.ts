import { z } from "zod";
import { prisma } from "./db";
import { getBoardForPricing, getCategoryBySlug } from "./board";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  normaliseText,
  normaliseUrl,
} from "./listing";
import { findProhibited, loadProhibitedKeywords } from "./moderation";
import { totalToClaim } from "./pricing";
import { uniqueSlug } from "./slug";

/**
 * Turning a submitted claim form into a pending bid that is safe to charge for.
 *
 * This lives outside the route handler because it is the half of checkout that
 * has to be *correct* rather than merely wired: it re-derives the price from the
 * live board, decides whether the buyer may be charged, and creates the rows. The
 * route handler is then a thin thing that calls this and talks to Stripe.
 *
 * ## The price the buyer saw is an upper bound, never a target
 *
 * Between the details page rendering a figure and the checkout being created, the
 * board can move. Three cases:
 *
 * - **The quote is unchanged** — charge it.
 * - **The quote went up** — the buyer would be charged more than the number on
 *   the button they pressed. That is refused, and they are sent back to see the
 *   new price.
 * - **The quote went down** — the cheaper figure is honoured, silently.
 *
 * The submitted figure is therefore only ever used to *refuse*, never to price.
 * That direction matters: trusting it as the charge would let a hand-crafted POST
 * buy rank one for a dollar.
 *
 * **Known gap.** The guard needs to know what the buyer was shown, which means
 * the form has to submit the figure it rendered. `ClaimDetailsForm` does not do
 * that yet — the plan recorded its field list as fixed and not to be altered in
 * this phase — so `quotedCents` is honoured when present and absent in practice.
 * With no bound submitted, the current price is charged, which means a price that
 * rose between the details page and the POST is **currently charged rather than
 * refused**. Closing that is a one-line hidden input on the form plus trusting it
 * here; it is left visible rather than pretended away.
 */

/** The fields the claim details form submits. */
export const ClaimFormSchema = z.object({
  rank: z.coerce.number().int().min(1),
  description: z.string().min(1),
  // Raising an existing listing sends this and nothing else identifying.
  productSlug: z.string().min(1).optional(),
  // New listings send this trio instead. `category` is a slug.
  url: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  /**
   * The figure rendered on the page the buyer pressed the button on, used as an
   * upper bound on what may be charged. Optional because the form does not send
   * it yet; see the module note above.
   */
  quotedCents: z.coerce.number().int().min(0).optional(),
});

export type ClaimFormInput = z.infer<typeof ClaimFormSchema>;

/**
 * A refusal, with the copy to show and where to show it.
 *
 * `redirectTo` is a path rather than a thrown redirect so this module stays
 * callable from a test; the route decides that a redirect is the right response.
 */
export type CheckoutRefusal = {
  ok: false;
  reason:
    | "invalid_form"
    | "no_such_product"
    | "no_such_category"
    | "unclaimable"
    | "price_changed"
    | "prohibited";
  message: string;
  redirectTo: string;
};

export type CheckoutReady = {
  ok: true;
  productId: string;
  productSlug: string;
  /**
   * The pending bid. Created before the Stripe session exists, and what
   * `metadata.bidId` on that session points at — so the webhook can find the row
   * even if Stripe's first event beats the session id being stamped back on.
   */
  bidId: string;
  /** What will be charged. Always ≤ the figure the buyer saw, when one was sent. */
  deltaCents: number;
  rank: number;
  /** "new" creates a listing; "raise" tops up one that is already on the board. */
  kind: "new" | "raise";
};

export type CheckoutResult = CheckoutRefusal | CheckoutReady;

/** Where a refused buyer goes to see the corrected figure. */
function detailsPathFor(input: {
  rank: number;
  productSlug?: string;
  category?: string;
}): string {
  const params = new URLSearchParams();
  if (input.productSlug) params.set("product", input.productSlug);
  if (input.category) params.set("category", input.category);
  params.set("rank", String(input.rank));
  return `/claim/details?${params.toString()}`;
}

/** Read the form fields out of a `FormData`-like record, or null if unusable. */
export function claimInputFrom(
  fields: Record<string, string | undefined>,
): ClaimFormInput | null {
  const parsed = ClaimFormSchema.safeParse(fields);
  return parsed.success ? parsed.data : null;
}

export async function prepareCheckout(
  input: ClaimFormInput,
): Promise<CheckoutResult> {
  const description = normaliseText(input.description, MAX_DESCRIPTION_LENGTH);
  const backToDetails = detailsPathFor({
    rank: input.rank,
    productSlug: input.productSlug,
    category: input.category,
  });

  if (!description) {
    return {
      ok: false,
      reason: "invalid_form",
      message: "A listing needs a description.",
      redirectTo: backToDetails,
    };
  }

  // An existing listing keeps its URL, title and category; only the description is
  // edited, so only it is validated from the form.
  const existing = input.productSlug
    ? await prisma.product.findUnique({
        where: { slug: input.productSlug },
        select: {
          id: true,
          slug: true,
          title: true,
          url: true,
          hidden: true,
          categoryId: true,
          totalPaidCents: true,
        },
      })
    : null;

  if (input.productSlug && (!existing || existing.hidden)) {
    return {
      ok: false,
      reason: "no_such_product",
      message: "That listing is not on the board.",
      redirectTo: "/claim",
    };
  }

  let url = existing?.url ?? null;
  let title = existing?.title ?? null;
  let categoryId = existing?.categoryId ?? null;
  let categorySlug = input.category ?? null;

  if (!existing) {
    url = normaliseUrl(input.url ?? "");
    title = normaliseText(input.title ?? "", MAX_TITLE_LENGTH);
    if (!input.category) {
      return {
        ok: false,
        reason: "invalid_form",
        message: "Pick a category for the listing.",
        redirectTo: backToDetails,
      };
    }
    const category = await getCategoryBySlug(input.category);
    if (!category) {
      return {
        ok: false,
        reason: "no_such_category",
        message: "That category does not exist.",
        redirectTo: backToDetails,
      };
    }
    categoryId = category.id;
    categorySlug = category.slug;
  }

  if (!url) {
    return {
      ok: false,
      reason: "invalid_form",
      message: "That destination is not a usable http or https address.",
      redirectTo: backToDetails,
    };
  }
  if (!title) {
    return {
      ok: false,
      reason: "invalid_form",
      message: "A listing needs a title.",
      redirectTo: backToDetails,
    };
  }

  // Moderation covers what a visitor will actually read on the board.
  const keywords = await loadProhibitedKeywords();
  const hit = findProhibited(`${title}\n${description}`, keywords);
  if (hit) {
    return {
      ok: false,
      reason: "prohibited",
      message: `Listings may not advertise “${hit}”. Remove it and try again.`,
      redirectTo: backToDetails,
    };
  }

  // Pricing is always against the all-time board, whichever tab is being viewed:
  // money is cumulative and permanent, so a claim is inherently an all-time act.
  const board = await getBoardForPricing(categorySlug ?? undefined);
  const quote = totalToClaim({
    product: existing
      ? { id: existing.id, totalPaidCents: existing.totalPaidCents }
      : null,
    targetRank: input.rank,
    board,
  });

  if (!quote.ok) {
    return {
      ok: false,
      reason: "unclaimable",
      message: quote.message,
      redirectTo: existing ? backToDetails : "/claim",
    };
  }

  // The guard: never charge more than the figure the buyer agreed to.
  if (input.quotedCents !== undefined && quote.deltaCents > input.quotedCents) {
    return {
      ok: false,
      reason: "price_changed",
      message:
        "The board moved and that rank now costs more than the price you were shown. Nothing has been charged — here is the new figure.",
      redirectTo: backToDetails,
    };
  }

  const deltaCents = quote.deltaCents;

  const product = existing
    ? await prisma.product.update({
        where: { id: existing.id },
        data: { description },
        select: { id: true, slug: true },
      })
    : await prisma.product.create({
        data: {
          slug: await uniqueSlug(title, async (candidate) => {
            const taken = await prisma.product.findUnique({
              where: { slug: candidate },
              select: { id: true },
            });
            return taken !== null;
          }),
          url,
          title,
          description,
          categoryId: categoryId as string,
        },
        select: { id: true, slug: true },
      });

  /*
   * The bid row is created BEFORE the Stripe session exists, which is the whole
   * reason `stripeSessionId` is nullable. That ordering is deliberate: it means
   * money can never arrive with no row to credit, and the webhook's
   * compare-and-swap always has something to transition.
   *
   * `amountCents` is provisional — the quote, not the payment. The webhook
   * overwrites it with the amount actually collected. A pending bid is excluded
   * from every board, pricing and stats query (all gate on status = 'paid'), so a
   * provisional figure can never influence a rank, and the invariant
   * `totalPaidCents === SUM(paid bids)` is untouched.
   */
  const bid = await prisma.bid.create({
    data: {
      productId: product.id,
      amountCents: deltaCents,
      status: "pending",
    },
    select: { id: true },
  });

  return {
    ok: true,
    productId: product.id,
    productSlug: product.slug,
    bidId: bid.id,
    deltaCents,
    rank: quote.targetRank,
    kind: existing ? "raise" : "new",
  };
}

/** Attach the created session to its bid, so a metadata-less event can find it. */
export async function attachSession(
  bidId: string,
  sessionId: string,
): Promise<void> {
  await prisma.bid.update({
    where: { id: bidId },
    data: { stripeSessionId: sessionId },
  });
}

/**
 * A refused claim's product, removed again.
 *
 * A new listing is only created once the buyer has been priced, so a decline
 * between those two points would otherwise leave a product with no money behind
 * it. It is invisible either way — every board query requires
 * `totalPaidCents > 0` — but an abandoned row is still litter, and deleting it is
 * cheaper than explaining it. Guarded on `totalPaidCents: 0` and no paid bids, so
 * it can never remove something that has been paid for.
 */
export async function discardUnpaidListing(productId: string): Promise<void> {
  await prisma.product
    .delete({
      where: { id: productId, totalPaidCents: 0, bids: { none: { status: "paid" } } },
    })
    .catch(() => {
      // If it does not match those conditions, it is not ours to delete.
    });
}

/**
 * What became of a claim, for the success page.
 *
 * Keyed on the session id because that is what Stripe appends to the return URL;
 * it is stamped onto the bid either by the checkout route or by the webhook's
 * backfill, so it resolves whether or not those two raced.
 *
 * Returns null for an unknown session rather than throwing: a hand-typed or stale
 * `session_id` is a normal thing to happen, not a fault.
 */
export async function getClaimStatus(sessionId: string) {
  const bid = await prisma.bid.findUnique({
    where: { stripeSessionId: sessionId },
    select: {
      id: true,
      status: true,
      amountCents: true,
      paidAt: true,
      product: {
        select: {
          id: true,
          slug: true,
          title: true,
          totalPaidCents: true,
        },
      },
    },
  });
  if (!bid) return null;

  // The stack the page draws is the listing's payment history, so it is the paid
  // bids rather than the one that triggered this visit — a raise shows both.
  const segments = await prisma.bid.findMany({
    where: { productId: bid.product.id, status: "paid" },
    orderBy: { paidAt: "asc" },
    select: { id: true, amountCents: true, paidAt: true },
  });

  return { bid, segments };
}
