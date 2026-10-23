# Phase A — foundation, design system, and every page in 2D

This is the review guide for phase (a). It records what exists, how to run it, what was
verified with real numbers, the decisions taken, and the two places where the framework
forced a trade I want you to know about before we build on top of it.

Per the agreed pacing, **nothing from phase (b) onward has been started** — no Stripe, no
click tracking, no 3D. What follows is the 2D product.

---

## Run it

```bash
npm install
npm run db:migrate      # create prisma/dev.db
npm run db:seed         # 30 categories, 62 listings, 235 payments, 319 clicks
npm run dev             # http://localhost:3000
```

Then:

```bash
npm run test            # 62 unit tests
npm run build           # production build — must pass before any phase is "done"
```

### A path to click through

| Step | What to look for |
|---|---|
| `/` | Hero, podium (top three, height ∝ money paid), all-time board, 50 rows/page, claim box, activity feed, stats line |
| `/` → **Today** tab | Redraws ranked by money paid since 00:00 UTC. Prices in the claim box do **not** change — see the decision below |
| `/claim` | Rank chooser with live server-priced ranks; pick #1 and watch the total update |
| `/claim?product=tessellate&rank=10` | Refused: "You already hold rank 10" |
| `/claim?product=tessellate&rank=13` | Refused: "Rank 13 sits below your current rank 10" |
| `/claim/details?rank=4` | The listing form: URL, title, category, 160-char description with a live counter |
| `/product/<any>` | Rank, total paid, click count, payment history as proportional segments **and** as a real `<ol>` |
| `/categories` | Populated boards, plus empty boards open for a first claim |
| `/category/<slug>` and `/category/<slug>/today` | Per-category boards with their own prices |
| `/about` `/rules` `/faq` `/terms` `/privacy` `/refunds` | Real copy, written for this product |
| `/product/nope`, `/category/nope` | Not-found UI — see the soft-404 note |
| `/go/<slug>` | **404, correctly** — click tracking is phase (d) |

---

## What was verified, with numbers

Not claims — these were run:

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` | clean |
| `npm run test` | **62 passed, 0 failed** (12 files) |
| `npm run build` | succeeds; 17/17 routes generated |
| Route status, production server | all 18 real routes **200**; `/nope` **404** |
| Board is crawlable text | ranks, titles, descriptions and prices confirmed as real DOM text in the server HTML — *not* only inside the RSC payload |
| Prices are server-computed | `/claim` rendered `#1 — $2,455`, `#6 — $591`, `#10 — $456` from the live board |
| Claim refusals | both rendered their specific message server-side |
| Today board has content | 5 seeded payments today; `/daily`, `/?period=today` and `/category/productivity/today` all populated |
| Seed invariants | every `totalPaidCents` equals the sum of its paid bids; no future-dated bids |

Route rendering modes from the build:

```
○ Static            /  /_not-found  /about  /faq  /privacy  /refunds  /rules  /terms
◐ Partial Prerender /  /categories  /claim  /claim/details  /daily
                    /category/[slug]  /category/[slug]/today  /product/[slug]
```

Every route is static or partially prerendered — **no blocking routes**. The static shell
ships instantly and only the data streams.

---

## Two trade-offs I want you to see

### 1. Unknown slugs return a soft 404, not a 404

Visiting `/product/does-not-exist` returns **HTTP 200** with the not-found UI and Next's
injected `<meta name="robots" content="noindex">`.

This is not an oversight, it is a direct consequence of the architecture. The response
starts streaming as soon as the static shell is flushed, and **an HTTP status cannot be
changed after the stream has begun**. Next's own docs say so:

> "The response starts streaming from the `<Suspense>` boundary before `notFound()` runs, so it keeps its `200` status. Next.js adds a `noindex` tag."

A real 404 requires checking the slug *before* anything streams — which under
`cacheComponents` means awaiting `params` in the page body. That is a blocking route: it
**fails the build**, and the documented opt-out (`export const instant = false`) would cost
every route its prerendered shell. I tried exactly that first; the build output above is
what the fix produced.

I judged a fast static shell on every real page to be worth more than a nicer status code on
the junk ones, especially since `noindex` already keeps those pages out of search results
and the user-visible behaviour is correct. **If you would rather have hard 404s, say so** —
the clean way is a slug check in `proxy.ts`, which returns the status before the page renders
at all.

### 2. `/go/[slug]` is not built yet

Footer and listing links render correctly with `rel="sponsored nofollow"`, but the redirect
target is phase (d). Until then those links 404 — expected, not broken.

---

## Decisions taken while building

- **Claims always price against the all-time board**, whichever tab is open. This is what
  you chose, and it is enforced in `ClaimBox.tsx`: the Today tab is a read-only lens and the
  price of a rank never changes because of which view you are looking at.
- **Hidden listings are excluded from display *and* from pricing.** The alternative —
  hide from view but keep them in the maths — makes ranks non-contiguous (`#1, #2, #4`),
  which is worse.
- **The product page shows cumulative payment history, not historical rank.** A true rank
  at each past moment is not derivable: it depends on every other listing's total at that
  instant, and those snapshots were never stored. Showing one would mean inventing it. Each
  segment is a real payment and the stack is real cumulative money.
- **Plain `<details>` for the FAQ**, not a JS accordion — a real disclosure widget that
  works with no JavaScript and stays open for text-only crawlers.
- **No new dependencies.** `framer-motion`, `three`, R3F and drei are deliberately not
  installed yet; they arrive in phase (e) so they cannot be accidentally imported into the
  2D layer.

---

## Files added in this phase

```
src/lib/       board.ts  pricing.ts  ranking.ts  db.ts  slug.ts  stats.ts
               listing.ts  request-time.ts  search-params.ts
src/components/board/     Board  BoardRow  TopCard  BoardTabs  Pagination
                          ClaimBox(+Client)  ActivityFeed  TiltCard  OutboundLink
                          CategoryScreen
src/components/fallback/  Podium2D  StackedSegments2D
src/components/claim/     ClaimForm  ClaimDetailsForm
src/components/ui/        Logo  SiteHeader  SiteFooter  Skeletons  Prose  StatsLine
src/app/                  layout  page  globals.css
                          daily  categories  rules  about  faq  terms  privacy  refunds
                          category/[slug]{,/today}  product/[slug]  claim{,/details}
prisma/                   schema.prisma  seed.ts  migrations/
src/tests/                pricing  ranking  slug  content
```

---

## Known gaps, deferred on purpose

| Gap | Phase |
|---|---|
| Stripe Checkout, webhook, mock checkout, `/claim/success` | (c) |
| `/go/[slug]`, click dedupe, bot filter | (d) |
| Admin, prohibited-keyword enforcement at submission | (f) |
| 3D scenes, 2D/3D toggle, parallax | (e) |
| Dynamic OG images, `sitemap.xml`, `robots.txt`, Lighthouse | (g) |
| Nonexistent `[slug]` returns 200 + `noindex` | see above |

---

## What I need from you before phase (b)

1. **The soft-404 trade-off** — accept it, or spend a little complexity in `proxy.ts` for
   hard 404s?
2. **Copy review.** All six text pages are written in the product's voice. The `/terms`,
   `/privacy` and `/refunds` pages are marked `Placeholder` in a visible violet banner: they
   are structurally complete and accurate about what the software does, but they need a
   lawyer's eye and your real contact address before you take money.
3. Anything in the visual design you want moved before it is built on top of.
