# Phase E — the 3D layer

This is the review guide for phase (e). It records what was built, how to see it, what
was verified with real numbers, and the decisions taken — including the one place where
building the tests changed the product code.

Per the agreed pacing, **nothing from phase (f) onward has been started**.

---

## What this phase is

The plan's one-line scope for (e) was: *podium, crown animation, tower view, tilt cards,
parallax, 2D/3D toggle*. All of that exists now, plus the fallback machinery that decides
who gets it.

The governing constraint throughout is that **a WebGL canvas cannot be server-rendered**.
Next.js refuses `ssr: false` in a Server Component outright:

> "`ssr: false` is not allowed with `next/dynamic` in Server Components. Please move it
> into a Client Component."

So every scene is lazily mounted from a Client Component seam, and **the 2D rendering is
the server-rendered, crawlable, accessible source of truth**. 3D is an upgrade applied on
top of it, never a prerequisite for it. This is not a nicety — it is what keeps the page
correct for crawlers, screen readers, and anyone without JavaScript.

---

## Run it

```bash
npm run dev             # http://localhost:3000
```

| Step | What to look for |
|---|---|
| `/` | 2D podium renders first (server HTML), then upgrades to a 3D podium with a slowly turning crown over #1, camera drift, and pointer parallax |
| `/` → scroll down | The tower: top 20 as one `InstancedMesh`, hover a bar for its tooltip, click through to the listing |
| `/` → the toggle under the podium | "Switch to 2D" / "Switch to 3D"; the choice survives a reload |
| `/category/<slug>` | The same podium, scoped to that category — a leader at $175, not the global $2,453 |
| `/product/<slug>` | Payment history as a 3D stack of segments, alternating gold and violet |
| Turn on **Reduce motion** in your OS | Everything still renders; drift, crown spin and parallax stop |
| Disable WebGL (`chrome://flags`) | 2D everywhere, and the toggle explains why — or hides, if there is no 3D to offer |

---

## What was verified, with numbers

Not claims — these were run against the production build (`next start`), inspecting the
**raw server HTML**:

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` | clean (0 errors, 0 warnings) |
| `npm run test` | **107 passed, 0 failed** (6 files) |
| `npm run build` | succeeds; 17/17 routes generated, all ○ Static or ◐ Partial Prerender |
| **`<canvas>` in server HTML** | **absent** on `/`, `/category/[slug]`, `/product/[slug]` |
| **three.js / R3F markers in server HTML** | **absent** |
| 2D podium in server HTML | present, with `aria-label="Rank 2: Nimbus Note, $1,187 paid"` × 3 |
| Crawlable content | 208 price strings and 31 product links in `/`'s server HTML |
| Render toggle in server HTML | absent — it renders `null` until detection has run, so it can never flash a wrong label |
| Category podium is category-scoped | `/category/developer-tools` shows "Rookery, $175", not the global $2,453 leader |

### The bundle split, which is the whole point

The 906K three.js chunk is **not referenced anywhere in the homepage's server HTML** —
`dynamic(..., { ssr: false })` genuinely code-splits it:

| Asset | Raw | Gzipped |
|---|---|---|
| Eagerly loaded JS on `/` (9 chunks) | 585K | **181K** |
| three.js chunk (loaded on demand, 3D only) | 906K | **241K** |

A visitor on the 2D board never downloads the 241K gzip of three.js. That is the fallback
design working as intended rather than as a promise.

---

## The bug the tests found

Worth calling out, because the test I wrote to document a behaviour instead disproved it.

The frame-rate probe decides whether to demote a device from 3D to 2D. It sampled **only**
frames longer than 20ms and took the median of that sample. The doc comment claimed the
median "ignores a handful of outliers by construction".

It did the exact opposite. With only slow frames left in the sample, the median *cannot*
dilute them — three catastrophic frames out of two hundred became the entire sample, so
the verdict was decided by 1.5% of the window. A capable laptop whose tab lost focus for a
moment during the probe would be demoted, and because the demotion is persisted, it stayed
demoted.

`judgeFrames` now takes the median of **every** frame in the window, which is what makes a
median robust in the first place. The test that caught it is still there:

```
ignores a few catastrophic frames on an otherwise fast run
```

Three real consequences of that fix:

- A hidden tab is no longer judged at all — the browser throttled it on purpose, which says
  nothing about the GPU.
- The demotion flag remains separate from the stored preference, so an automatic demotion
  never overwrites an explicit choice, and choosing a mode clears it.
- `1000 / median >= 40` is the threshold, inclusive, so exactly-40fps passes.

---

## Decisions taken while building

- **Block heights are square-rooted, not linear.** Money on this board spans two orders of
  magnitude, so a linear scale makes the leader a wall and everyone else a sliver.
- **The 2D twin scales from the same `moneyRange` as the 3D scene**, so switching between
  them rescales nothing — it changes the medium, not the reading.
- **`getBoardMoneyRange` and `getTopRows` are category-scoped.** A category leader at $175
  scaled against the global $2,453 would draw as an indistinguishable sliver. Heights are
  only meaningful relative to the board they belong to.
- **Billboards are drei `<Html>`, not `<Text>`.** `<Text>` bakes glyphs into a canvas
  texture, invisible to crawlers and screen readers. `<Html>` mounts real DOM. (It is still
  client-only, which is why the 2D board is mandatory.)
- **No podium on the Today tab.** A podium draws who *holds* the ranks, and ranks are held
  with cumulative money. On a tab whose statement is "what moved since midnight UTC" it
  would answer a question nobody asked.
- **The camera is driven from the frame callback, not React state.** Camera position is a
  three.js object the renderer owns; putting it in state would re-render every frame, which
  is the thing the frame loop exists to avoid.
- **The render mode lives in a `useSyncExternalStore` store, not `useState` + effect.**
  Browser capability is an external system, and reading it in an effect body via `setState`
  is a cascading render — React's linter flags it, correctly. See
  `src/components/three/render-mode-store.ts`.
- **The store is created per provider instance, not as a module singleton.** This one was a
  real bug, caught in the browser rather than by the tests. React calls `getServerSnapshot`
  during hydration so the first client render matches the HTML, but a module-level value can
  be written before that happens — a Fast Refresh re-render, or the module surviving a
  client-side navigation. The client then hydrated `ready: true` against server HTML rendered
  `ready: false`, and React reported it as "Hydration failed because the server rendered HTML
  didn't match the client" on `RenderModeToggle`. A factory whose snapshot lives in a closure
  cannot do this: it starts at the server snapshot and is only written after mount.
  `src/tests/render-mode-store.test.ts` now pins the property directly, by asserting a value
  written to one store is never visible to another.
- **Bloom is not shipped.** The plan gated it on measuring ~60fps on a mid-range laptop,
  and that measurement needs a browser I cannot drive from here. The scenes are lit by
  emissive materials and fog instead. `@react-three/postprocessing` is deliberately **not
  installed** — the gate was not passed, so the dependency stays out.

---

## What the policy actually decides

`decideRenderMode` is pure and unit-tested. WebGL support is a **hard requirement** checked
before anything else; every other reason is a preference about quality that an explicit
choice can override:

| Situation | `auto` | explicit `2d` | explicit `3d` |
|---|---|---|---|
| Nothing wrong | 3D | 2D | 3D |
| `prefers-reduced-motion: reduce` | 2D | 2D | 3D (motion still off) |
| Low-power device | 2D | 2D | 3D |
| Frame-rate probe failed | 2D | 2D | 3D |
| **No WebGL at all** | 2D | 2D | **2D** |

The last row is the point: "overriding" a missing WebGL context is not a thing that can
succeed, so offering it would mount a canvas that draws nothing. Reduced motion is honoured
*inside* the scenes — no drift, no spin — because it is a preference about movement, not
about which renderer to use.

---

## Files added in this phase

```
src/lib/                  scene-mode.ts   fps.ts
src/components/three/     SceneFrame  PodiumScene  TowerScene  ProductBlockScene
                          SceneMount  RenderModeProvider  render-mode-store
                          RenderModeToggle
src/components/fallback/  Tower2D               (Podium2D, StackedSegments2D predate this)
src/tests/                render-mode.test.ts  render-mode-store.test.ts
```

Changed: `src/app/layout.tsx` (provider), `src/app/page.tsx` (podium + tower section),
`src/app/category/[slug]/page.tsx` + `CategoryScreen.tsx` (category podium),
`src/app/product/[slug]/page.tsx` (3D stack), `src/lib/board.ts` (category scoping).

---

## Still open from earlier phases

These were raised in the phase (a) review and have not been answered:

1. **The soft-404 trade-off** — accept 200 + `noindex` for unknown slugs, or spend a little
   complexity in `proxy.ts` for hard 404s?
2. **Legal copy review.** `/terms`, `/privacy` and `/refunds` carry a visible `Placeholder`
   banner. They are structurally complete but need a lawyer's eye and a real contact
   address before money moves.
3. **Lighthouse numbers.** The plan defers these to phase (g); they need a real browser, so
   they are not claimed here.
