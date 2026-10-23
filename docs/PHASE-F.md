# Phase F — Admin

This is the review guide for phase (f). It records what was built, how to run and exercise
it, and the decisions taken. Per the agreed pacing, nothing from phase (g) onward has been
started — and see "Still open" for the one earlier-phase gap this work surfaced.

---

## What this phase is

The plan's one-line scope was: `/admin` protected by an env-var password, with hide/unhide
of products, a view of bids, and an editor for the prohibited-keyword list. All three exist
on one page. The legal pages named in the same phase item were built in phase (a), so the
admin area is the whole of this phase.

---

## Run it

```bash
# .env must carry a password for the admin area to open at all:
ADMIN_PASSWORD="something-long-and-random"

npm run dev             # http://localhost:3000/admin
```

| Step | What to look for |
|---|---|
| `/admin`, no session | The password form. Nothing else. |
| `/admin?error=login` | "That password is not right." — a wrong password lands here |
| Correct password | The panel: listings table, bids table, keywords editor, Sign out |
| Hide a listing | It disappears from `/` and its `/product/<slug>`; its money and bid history stay in the database |
| Unhide it | The listing returns at its money-paid rank |
| Keywords tab | Textarea prefilled from the `Setting` row; add a word, save |
| A claim using the new word | Refused at checkout with the moderation message — no restart needed |
| `robots` of `/admin` | `noindex, nofollow` |

**With no `ADMIN_PASSWORD` set**, `/admin` shows "Admin is locked" and every action refuses.
That is the intended failure mode: an unconfigured deployment is closed, not open.

---

## What was verified, with numbers

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` | clean |
| `npm run test` | **178 passed, 0 failed** (9 files) — 152 pre-existing plus 26 new |
| `npm run build` | succeeds; `/admin` generated as ◐ Partial Prerender, `noindex` |

### The new tests (src/tests/admin.test.ts)

- Token round-trip; tampered payload (expiry pushed forward) rejected; signature from a
  different password rejected; garbage cookie values rejected.
- Expiry honoured on both sides of the boundary: a token stops verifying one second past
  its 7 days and still verifies one second before.
- No password configured: no token mints, nothing verifies, nothing matches.
- `setProductHidden` flips both ways and, on hide, leaves `totalPaidCents` and the bid rows
  untouched — moderation cannot erase the record of money actually paid.
- `listAllProductsAdmin` includes hidden products (the one query in the app that does) and
  orders by money, highest first.
- `listRecentBidsAdmin` pairs each bid with its product title and returns counts by status.
- `saveKeywordSetting` upserts the `Setting` row and, after `resetKeywordCache()`,
  `loadProhibitedKeywords()` sees the new list — the cache reset is what makes the edit live
  without a restart.

---

## Decisions taken while building

- **The cookie carries a signed expiry, not the password.** `mintToken`/`verifyToken` in
  `src/lib/admin-auth.ts` produce `expires.signature` where the signature is an HMAC of the
  expiry keyed off the admin password itself. No second secret exists to configure; rotating
  the password invalidates every outstanding session for free. Both the password comparison
  and the signature comparison run through fixed-length digests before `timingSafeEqual`,
  so neither the password's length nor the signature's length is observable in timing.
- **Every action re-checks the session.** A Server Action is an HTTP POST endpoint that
  renders nothing and trusts nothing: `toggleHidden` and `saveKeywords` call
  `isAdminSessionValid()` before touching the database, exactly as the bundled
  mutating-data guide warns. The button that rendered the form is decoration, not
  authorization.
- **Hide/unhide sends the target state explicitly** (`hidden=true|false` in the form), rather
  than the server flipping what it read. Two admins clicking the same row cannot race the
  read-then-write into a stale flip: the button's own label is the intent.
- **Hiding is removal, not deletion.** The board queries filter `hidden` from display and
  pricing (a decision recorded in phase (a) in `src/lib/board.ts`), so the money, the bid
  history and the slug all survive a hide. That is the point: the money was really paid,
  and a moderation action must not be able to erase that.
- **No cache invalidation anywhere in this phase.** No route uses `use cache` or `cacheTag` —
  the boards are Partial Prerender and their queries run per request — so a hidden listing
  is off the public board on the next request with no `revalidatePath` to forget. The one
  piece of cross-process state the admin touches is the keyword cache in
  `src/lib/moderation.ts`, and `saveKeywords` clears it through `resetKeywordCache()`
  explicitly. `refresh()` is called in the actions purely so the admin's own table shows
  the row they just pressed, in the same response.
- **Login failure rides the query string** (`/admin?error=login`), the same mechanism the
  checkout route uses for its refusals. There is nothing to enumerate: one password, one
  refusal message.
- **The whole panel is one page with anchor links**, not sub-routes. Three sections, one
  session check, one Suspense boundary — the session cookie is request data under
  `cacheComponents`, so reading it anywhere in the page body would have made the route
  blocking. It reads inside `AdminContent`, behind the boundary, and the static shell above
  it prerenders like every other route.
- **Mutation cores live in `src/lib/admin.ts`, actions are thin wrappers.** The actions
  (`src/app/admin/actions.ts`) authorize and redirect; the queries and writes live in the
  lib module, which is what the tests drive — the request context (`cookies()`, `redirect()`)
  is the only thing a wrapper adds, and it is not what needed proving.

---

## Files added in this phase

```
src/lib/admin-auth.ts     token mint/verify, password match, cookie set/clear, session check
src/lib/admin.ts          admin queries + mutation cores (products incl. hidden, bids, keywords)
src/app/admin/page.tsx    the page: login form, panel, three sections
src/app/admin/actions.ts  'use server' — login, logout, toggleHidden, saveKeywords
src/tests/admin.test.ts   26 tests, listed above
```

---

## Still open

1. **`/go/[slug]` (phase d) was never built.** Every board link points through it
   (`src/components/board/OutboundLink.tsx`) and gets a 404 today. The click model, the
   dedupe and the UTM redirect are the remaining gap in the spec. This phase did not touch
   it — proposed as the immediate next work.
2. **Phase (g)**: `sitemap.xml` and `robots.txt` do not exist yet, Lighthouse numbers are
   unmeasured, and the README is still the create-next-app placeholder — all deferred to
   the final pass per the plan.
3. The soft-404 trade-off and the legal-copy review, still open from phase (a).
