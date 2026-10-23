# Phase C — Money

This is the review guide for phase (c). It records what was built, how to exercise it with
no Stripe account at all, what was verified with real numbers, and the decisions taken —
including one where a build-output label turned out to be hiding a genuine hazard.

Per the agreed pacing, **nothing from phase (d) onward has been started**.

---

## What this phase is

The plan's one-line scope was the money path: turn the claim form into a Stripe Checkout,
and credit a rank when Stripe says the money arrived. Before this phase the details form
already POSTed to `/api/stripe/checkout`, which did not exist — **submitting it 404'd**. It
now completes.

Everything here is built against the real Stripe SDK and the real webhook signature check.
What is *not* real is the checkout page itself: with `STRIPE_SECRET_KEY` blank the route
hands off to a development-only mock that signs a genuine event with the SDK's own signer
and drives the real webhook handler in-process. The money path is provable offline today;
the live-Stripe hop is the only part deferred to a written checklist.

The governing constraint is that **money moves and rank is derived from it**, so the two
things that must not happen are:

- a duplicate delivery crediting twice, and
- a payment landing with no row to credit.

Both are answered by the schema and the webhook design below, not by hope.

---

## Run it

```bash
npm run dev             # http://localhost:3000
```

No Stripe keys are needed. `STRIPE_SECRET_KEY` blank is the supported offline path.

| Step | What to look for |
|---|---|
| `/claim` | Pick a rank. The chooser lists the board with each rank's current price |
| `/claim/details?rank=3&category=ai-tools` | Fill in title, URL, description; submit |
| submit | **303 → `/api/dev/mock-checkout?bid=…`** → **303 → `/claim/success?session_id=…`** |
| `/claim/success` | "Payment confirmed", the rank held, what was charged, the payment stack |
| The board (`/category/ai-tools`) | The new listing is on it, and the total moved by what was charged |
| Reload the mock-checkout URL | The same event id is replayed; **nothing moves** the second time |

### The offline money path, by hand

The two commands that make the whole thing reproducible without a browser:

```bash
# 1. Submit the claim form the details page submits.
curl -s -i -X POST http://localhost:3000/api/stripe/checkout \
  --data-urlencode "rank=3" \
  --data-urlencode "title=E2E Probe Listing" \
  --data-urlencode "url=https://example.com/e2e-probe" \
  --data-urlencode "description=Created by the end to end verification run." \
  --data-urlencode "category=ai-tools"
# → 303, Location: /api/dev/mock-checkout?bid=<bidId>

# 2. Follow it. This signs a real event and runs the real webhook.
curl -s -i "http://localhost:3000/api/dev/mock-checkout?bid=<bidId>"
# → 303, Location: /claim/success?session_id=cs_mock_<bidId>
```

Note the **303**, not a 307. `NextResponse.redirect()` defaults to 307, which preserves the
POST method, so a refresh would re-POST and charge again. Every navigation in the checkout
route is an explicit hand-built 303 with the reasoning in the handler.

---

## What was verified, with numbers

Not claims — these were run against the running server, and the database was inspected
directly.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean (exit 0) |
| `npx eslint .` | clean (0 errors, 0 warnings) |
| `npx vitest run` | **159 passed, 0 failed** (8 files) |
| `npx next build` | exit 0, **21 routes** |
| `/api/stripe/checkout` | ƒ (Dynamic) |
| `/api/stripe/webhook` | ƒ (Dynamic) |
| `/api/dev/mock-checkout` | ƒ (Dynamic) — see "the ○ that was wrong" below |
| `/claim/success` | ◐ (Partial Prerender) |
| Full path POST → mock → success | **303 → 303 → 200**, credit landed |
| Credit amount | `totalPaidCents` 500, `paidAt` stamped, `stripeSessionId` backfilled |
| **Replay the same event** | `totalPaidCents` unchanged, `lastBidAt` unchanged, **1** `ProcessedEvent` row |
| Raise path | 500 → **245800** (`500 + 245300`), both bids `paid` |
| Money invariant | `SUM(Product.totalPaidCents) === SUM(paid Bid.amountCents)` → **2,042,500 === 2,042,500** |
| Price-rise guard | bound of 100 against a real 500 → **refused** with a re-quote redirect |
| Exact bound | bound of 500 → proceeds |
| `/claim/details` error banner | `role="alert"` present, message rendered |
| **`/api/dev/mock-checkout` under `next start`** | **404**, with and without `?bid=` |
| `<canvas>` in `/claim/success` server HTML | **0** |
| `/claim/success` robots | `<meta name="robots" content="noindex, nofollow">` |
| `/claim/success` text | "Payment confirmed", "rank # 1", "$5 was charged", "Total on this listing $2,458" |
| Test database | `prisma/test.db` and its sidecars **removed** by the global teardown |

### What was *not* run here

The plan listed "re-run the headless-browser hydration sweep from phase (e) across the new
routes". **Neither Playwright nor Puppeteer is installed in this project** — phase (e)'s
sweep was not a script left behind in the repo, so there was nothing to re-run. What stands
in for it above is the server-HTML inspection (no canvas, `noindex`, real text), which
covers the crawlability half. The hydration half of that sweep needs a browser and is
unverified in this phase; the new routes are `/claim/success` and two POST-only API routes,
and the only interactive surface is the details form's error banner, which renders
server-side. Worth confirming in a browser at review rather than claimed.

---

## The ○ that was wrong, and why it mattered

`next build` labelled `/api/dev/mock-checkout` as **○ Static**. A GET handler that mutates
the board being prerendered is a real hazard: if the body runs at build time, then a build
could credit a payment with no request behind it.

It was not currently dangerous, and the reason is worth stating precisely because it is
also why the first attempted fix did nothing:

- `next build` sets `NODE_ENV=production`, and the production guard was the **first
  statement** of the handler. So the prerender always produced the 404.
- `markRequestTime()` was then added *after* that guard, commented as making the opt-out
  "certain". It was unreachable during the build-time prerender — the guard returned before
  it. The classification did not change, because nothing had changed.

The safety was real but accidental, resting on the guard staying the first statement. The
fix was to move `connection()` **above** the guard, so it cannot be short-circuited, and to
correct the comment to record the measurement rather than an intention. The classification
then flipped to **ƒ**, and production still 404s (verified above).

## The stale dev server that looked like a bug

The first end-to-end POST returned **500**, and the server log showed Prisma rejecting
`bid.create` with `Argument 'stripeSessionId' is missing.` — as though the nullable column
were required. It is not:

- the migration has `"stripeSessionId" TEXT` (nullable) and a unique index,
- the schema has `stripeSessionId String? @unique`,
- the generated client has `stripeSessionId?: string | null`,
- and a direct probe against the on-disk client created a bid with `stripeSessionId: null`.

The running dev server had started before the migration that made the column nullable, and
was still serving its compiled Prisma client from that earlier state. A restart fixed it and
the same POST then returned 303. Recorded here because "the tsconfig/types are right but the
server disagrees" is exactly the kind of thing worth recognising rather than debugging.

---

## The webhook's idempotency design

Two distinct keys guard two distinct failure modes:

- **`ProcessedEvent.stripeEventId` is unique** — the same event redelivered. The second
  delivery hits a unique violation, the transaction rolls back, and the outcome is reported
  as `replay`.
- **The `Bid` status compare-and-swap** — *different* events for the same session. The
  credit is `updateMany({ where: { id, status: { not: "paid" } } })`, so two deliveries race
  on one row and exactly one wins. It is a CAS rather than read-then-write, so it does not
  depend on the two being serialized.

Crediting uses an atomic `{ increment }` and never read-modify-write, which is what keeps
`Product.totalPaidCents === SUM(paid Bid.amountCents)` true under any interleaving.

### The decisions that are not obvious from the code

- **`claimed.count === 0` is recorded and committed, not rolled back.** The plan said roll
  back. It was overruled: rolling back would discard the only record that an unmatched
  payment exists. Money with nothing to credit it against should be *findable*, which means
  the row has to survive.
- **The two CAS predicates are deliberately asymmetric.** Crediting will move a bid that is
  `failed` back to `paid` — so a session that expired and was then retried still credits —
  which is why the credit predicate is `status: { not: "paid" }` and not `status: "pending"`.
  Failing keeps the narrow `status: "pending"`, so a late failure event can never un-credit
  a paid bid. A test pins each direction.
- **The bid is resolved by `metadata.bidId` first, `stripeSessionId` second.** The session
  id is stamped on the bid *after* the session is created, so Stripe's first event can beat
  that write. `metadata.bidId` is on both the session and the payment intent; the
  payment-intent copy is what ties a `payment_intent.payment_failed` — which carries no
  session — back to its row.
- **`lastBidAt` can only ever move forward.** It is written with an `OR` guard
  (`null | lt(paidAt)`), so an out-of-order delivery cannot make the board's tiebreak
  order jump backwards in time.
- **The mock drives the real handler in-process, not over HTTP.** A self-`fetch()` would
  depend on the server reaching its own origin and add a round trip whose failure mode is
  indistinguishable from a real webhook failure — while testing nothing extra.
- **The mock's event id is derived from the bid** (`evt_mock_<bidId>`), so reloading the URL
  replays *the same event* and demonstrates idempotency by hand. A random id would make the
  second hit look like a second payment.

### A deliberate asymmetry worth naming

`amount_total` from Stripe **overwrites** the quoted `deltaCents` in the same CAS that flips
the status to `paid`. The provisional insert value is the quote; the authoritative value is
what was actually collected. Both the increment and the authoritative write happen in one
transaction with the same value, and every board, stats and pricing query gates on
`status = 'paid'`, so a pending provisional figure can never influence a price or a rank.

---

## Known gap: the price guard has no upper bound in practice

The user's decision was: **a price that moved up is refused, not charged; a price that moved
down is honoured silently.** The route implements exactly that. But it can only enforce it
against a figure the buyer actually submitted, and **`ClaimDetailsForm` does not submit
one yet** — its field list was fixed by the plan and not to be altered in this phase.

So today: `quotedCents` is honoured when present, and absent in practice. A form-crafted
POST can prove the guard works (the `curl` above does), but a real browse cannot. In the
meantime a price that rises between the details page and the POST is **charged rather than
refused**.

This is left visible rather than papered over. Closing it is a hidden input on the form
carrying the figure it rendered, plus trusting it here — the guard is already written and
tested to receive it. Note the direction of the trust: the submitted figure can only ever
act as an *upper bound* on what is charged, never as the price itself, so a hostile form
cannot use it to buy rank for a dollar.

---

## Files

```
src/lib/           checkout.ts   webhook.ts   stripe.ts   moderation.ts
src/app/api/stripe/checkout/route.ts      POST the form → 303 to Stripe or the mock
src/app/api/stripe/webhook/route.ts       verify + applyEvent, the only entry point
src/app/api/dev/mock-checkout/route.ts    dev-only, signs a real event
src/app/claim/success/page.tsx            the outcome, noindex
src/tests/         webhook.test.ts   listing.test.ts   global-setup.ts
```

Changed: `src/app/claim/details/page.tsx` (renders the refusal banner), `vitest.config.ts`
(global setup + test env), `.gitignore` (the test database).

### Test isolation, since `db:reset` is off limits

Tests must not touch `prisma/dev.db`. A `globalSetup` removes a fresh `prisma/test.db`, runs
a **non-destructive** `prisma migrate deploy` against it, and tears the files down again.
The dev board is never opened by the suite — verified by its mtime being unchanged after a
run.

---

## Still open from earlier phases

Unchanged, and carried forward:

1. **The soft-404 trade-off** — accept 200 + `noindex` for unknown slugs, or spend a little
   complexity in `proxy.ts` for hard 404s?
2. **Legal copy review.** `/terms`, `/privacy` and `/refunds` are structurally complete but
   need a lawyer's eye and a real contact address before money moves.
3. **Lighthouse numbers** and the **bloom decision** — both need a real browser and land in
   phase (g).
4. **Whether to add a web app manifest** — asked during phase (e), not yet answered.

New, raised here:

5. **The hidden `quotedCents` input** on `ClaimDetailsForm`, to close the gap above.
6. **Live-Stripe verification.** The real-SDK path is written and correct but has never been
   exercised against Stripe, only against the mock. It needs a checklist run with real test
   keys and the `stripe` CLI forwarding to `/api/stripe/webhook`.
