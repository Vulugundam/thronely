import Stripe from "stripe";

/**
 * The single place that decides whether real Stripe or the local mock is in
 * play, and the single place that verifies a webhook signature.
 *
 * The whole money path has to be provable on a laptop with no Stripe account,
 * which is why nothing here throws when the keys are absent. Instead
 * `stripeOrNull()` returns null, the checkout route falls back to
 * `/api/dev/mock-checkout`, and that route signs the event it emits with the
 * same secret this module verifies with. The signature check is therefore never
 * bypassed in development — the mock exercises the real code path rather than
 * short-circuiting it.
 */

/**
 * The signing secret used when `STRIPE_WEBHOOK_SECRET` is unset.
 *
 * This is the one value in the file that must never reach production, and the
 * guard is not a comment: `webhookSecret()` throws if this is what it would
 * return while `NODE_ENV === "production"`. A deployment that forgets to set the
 * real secret fails loudly at the first webhook instead of silently accepting
 * events signed with a value that is in the repository.
 *
 * The value is deliberately shaped like a real one so the Stripe SDK's own
 * parsing is exercised, but it is not, and cannot be, a real signing key.
 */
const DEV_WEBHOOK_SECRET = "whsec_dev_only_not_a_real_secret";

/**
 * A placeholder key for signing only.
 *
 * The `Stripe` constructor rejects a blank key, and `generateTestHeaderString`
 * never contacts the API, so the mock needs a syntactically valid string and
 * nothing more. Shaped like a test key so it can never be mistaken for a live one.
 */
const DEV_SIGNING_KEY = "sk_test_dev_only_not_a_real_key";

let cached: Stripe | null | undefined;

/**
 * A configured Stripe client, or null when no secret key is set.
 *
 * Cached because the constructor validates the key format and builds an HTTP
 * agent; doing that per request would be wasteful and would also make a bad key
 * fail on every request rather than once.
 */
export function stripeOrNull(): Stripe | null {
  if (cached !== undefined) return cached;

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  // An empty string is how .env.example ships, so treat blank as "not set"
  // rather than as a key.
  cached = key ? new Stripe(key) : null;
  return cached;
}

/** True when real Stripe is configured; false means the dev mock is in play. */
export function stripeConfigured(): boolean {
  return stripeOrNull() !== null;
}

/**
 * The webhook signing secret to verify against.
 *
 * Throws in production when no real secret is set, which is the point: a
 * production deployment must not verify against a constant that ships in the
 * source tree.
 */
export function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is not set. Refusing to verify webhooks against the development secret in production.",
      );
    }
    return DEV_WEBHOOK_SECRET;
  }

  return secret;
}

/** The signing secret the dev mock must use. Throws outside development. */
export function devWebhookSecret(): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development mock checkout is not available in production.");
  }
  return webhookSecret();
}

/**
 * Verify a webhook payload and return the parsed event.
 *
 * Takes the raw body as a string, never a parsed object: the signature is
 * computed over the exact bytes Stripe sent, so re-serialising parsed JSON
 * changes the payload and the check fails. Throws on a bad signature — the
 * caller decides the status code, because a webhook route and a mock script want
 * to react differently.
 */
export function verifyEvent(rawBody: string, signature: string | null): Stripe.Event {
  if (!signature) {
    throw new Error("Missing stripe-signature header.");
  }
  return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret());
}

/**
 * The absolute URL a Checkout Session should return to after payment.
 *
 * Derived from the request's origin rather than a configured constant so it is
 * correct on localhost, on a preview deployment and in production without a
 * per-environment setting to forget.
 */
export function originFrom(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * A hosted Checkout Session for one claim.
 *
 * `metadata.bidId` is set on the session **and** on its payment intent, and that
 * pairing is load-bearing rather than decorative:
 *
 * - On the session, it is what lets the webhook find the bid when Stripe's
 *   `checkout.session.completed` beats the write that stamps `stripeSessionId`
 *   onto the row. The bid is created before this call precisely so the id exists
 *   to be referenced.
 * - On the payment intent, it is what ties a `payment_intent.payment_failed` —
 *   which carries no session at all — back to the same row, so a decline can mark
 *   the right bid failed instead of looking like an orphan.
 *
 * `automatic_tax` is left off, and that is a correctness choice rather than a
 * simplification: with it on, the amount collected is the amount *plus* tax, so
 * the charged cents would no longer match the whole-dollar figure the pricing
 * rules produced and the buyer would be shown one number and charged another.
 * Turning tax on is a pricing-rule change — the tax has to be part of the quoted
 * figure — not a flag on this call.
 *
 * `payment_method_types` is left to Stripe's dynamic defaults, which is what the
 * recent API versions require: an explicit list is deprecated and rejects
 * methods that are enabled in the dashboard.
 */
export async function createCheckoutSession(options: {
  stripe: Stripe;
  request: Request;
  bidId: string;
  productSlug: string;
  productTitle: string;
  amountCents: number;
  description: string;
  /** The rank being claimed, so a cancelled checkout returns to it. */
  rank: number;
}): Promise<Stripe.Checkout.Session> {
  const origin = originFrom(options.request);

  return options.stripe.checkout.sessions.create({
    mode: "payment",
    // Inline price_data rather than a pre-created Price, because every claim is
    // for a different amount and creating a Price object per checkout would litter
    // the account with one-off products.
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: options.amountCents,
          product_data: { name: options.productTitle },
        },
      },
    ],
    metadata: { bidId: options.bidId, productSlug: options.productSlug },
    payment_intent_data: {
      metadata: { bidId: options.bidId, productSlug: options.productSlug },
      description: options.description,
    },
    // The success page needs the session id to find the bid. Stripe appends it,
    // so the route must not try to add it itself.
    success_url: `${origin}/claim/success?session_id={CHECKOUT_SESSION_ID}`,
    // Back to the same rank, so a cancelled checkout resumes where it left off
    // rather than dumping the buyer at the top of the chooser.
    cancel_url: `${origin}/claim/details?rank=${options.rank}&product=${encodeURIComponent(options.productSlug)}`,
  });
}

/**
 * The `Stripe-Signature` header for a payload, signed the way Stripe signs one.
 *
 * Uses the SDK's own generator rather than a hand-rolled HMAC, so the dev mock
 * and the tests exercise the real `t=…,v1=…` scheme instead of a reimplementation
 * that can drift from it. The mock exists to run the *real* verification path, so
 * it must not be the one place that guesses how the signature is formed.
 *
 * Never reachable in production: the caller is the dev-only mock route, which
 * refuses in production, and `devWebhookSecret()` throws outside development.
 */
export function signTestEvent(
  payload: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  // The signing helper only needs *a* key to construct a client with; it never
  // contacts the API. The placeholder keeps the mock working with blank env, and a
  // configured key is used when one exists so signing matches production exactly.
  const stripe = stripeOrNull() ?? new Stripe(DEV_SIGNING_KEY);
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: devWebhookSecret(),
    timestamp,
  });
}
