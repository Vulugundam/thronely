"use client";

import dynamic from "next/dynamic";
import { useRenderMode } from "./RenderModeProvider";
import { Podium2D } from "@/components/fallback/Podium2D";
import { Tower2D, type TowerRow } from "@/components/fallback/Tower2D";
import { StackedSegments2D } from "@/components/fallback/StackedSegments2D";
import type { BoardRow } from "@/lib/board";
import type { Segment } from "@/components/fallback/StackedSegments2D";

/**
 * Mounting the 3D scenes.
 *
 * The `dynamic(..., { ssr: false })` calls have to live in this Client Component.
 * Next.js refuses `ssr: false` in a Server Component outright:
 *
 *   "`ssr: false` is not allowed with `next/dynamic` in Server Components.
 *    Please move it into a Client Component."
 *
 * and every page here is a Server Component, so this module is the seam. It is
 * also why the 2D twin is imported eagerly rather than lazily: it is the thing
 * that has to render even when JavaScript never arrives.
 *
 * `ssr: false` is not a workaround — it is the point. A WebGL canvas cannot be
 * server-rendered, so trying to would only emit a placeholder that differs from
 * the client's first paint and produce a hydration mismatch.
 */

/** Matches the 2D podium's height so promoting to 3D does not shift the page. */
const PODIUM_HEIGHT = "clamp(320px, 42vw, 440px)";

/** Matches the 2D tower grid's height. */
const TOWER_HEIGHT = "clamp(360px, 48vw, 520px)";

/** Matches the 2D payment stack's height. */
const STACK_HEIGHT = "clamp(90px, 12vw, 130px)";

const LazyPodiumScene = dynamic(
  () => import("./PodiumScene").then((mod) => mod.PodiumScene),
  {
    ssr: false,
    loading: () => <SceneShell height={PODIUM_HEIGHT} />,
  },
);

const LazyTowerScene = dynamic(
  () => import("./TowerScene").then((mod) => mod.TowerScene),
  {
    ssr: false,
    loading: () => <SceneShell height={TOWER_HEIGHT} />,
  },
);

const LazyProductBlockScene = dynamic(
  () => import("./ProductBlockScene").then((mod) => mod.ProductBlockScene),
  {
    ssr: false,
    loading: () => <SceneShell height={STACK_HEIGHT} />,
  },
);

/** The dark room the canvas draws into, sized to match the 2D twin. */
function SceneShell({ height }: { height: string }) {
  return (
    <div
      aria-hidden="true"
      className="skeleton w-full rounded-card"
      style={{ height }}
    />
  );
}

/**
 * The podium: 3D when it is available and chosen, the 2D blocks otherwise.
 *
 * `moneyRange` is passed to both so the two renderings scale identically — the
 * swap between them changes the medium, not the information.
 */
export function PodiumStage({
  rows,
  moneyRange,
}: {
  rows: BoardRow[];
  moneyRange: { min: number; max: number };
}) {
  const { resolved, animate, ready } = useRenderMode();

  // Before detection finishes this is the server-rendered 2D markup, so the
  // first client paint matches the HTML exactly.
  if (!ready || resolved !== "3d") {
    return <Podium2D rows={rows} moneyRange={moneyRange} />;
  }

  return (
    <div style={{ height: PODIUM_HEIGHT }} className="w-full">
      <LazyPodiumScene
        rows={rows.slice(0, 3).map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          totalPaidCents: row.totalPaidCents,
        }))}
        moneyRange={moneyRange}
        animate={animate}
      />
    </div>
  );
}

/**
 * The tower: the top twenty, 3D when available.
 *
 * Shown only on the homepage, below the board, so the crawlable list of twenty
 * rows above it is always the primary rendering of the same data.
 */
export function TowerStage({ entries }: { entries: TowerRow[] }) {
  const { resolved, animate, ready } = useRenderMode();

  if (!ready || resolved !== "3d") {
    return <Tower2D entries={entries} />;
  }

  return (
    <div style={{ height: TOWER_HEIGHT }} className="w-full">
      <LazyTowerScene entries={entries} animate={animate} />
    </div>
  );
}

/**
 * A listing's payment history, as a 3D stack or the 2D segments.
 *
 * The heights come from the same cumulative money in both renderings, so the
 * "you can see what was paid" reading survives the swap.
 */
export function PaymentStackStage({
  segments,
  totalCents,
}: {
  segments: Segment[];
  totalCents: number;
}) {
  const { resolved, animate, ready } = useRenderMode();

  if (!ready || resolved !== "3d") {
    return <StackedSegments2D segments={segments} totalCents={totalCents} />;
  }

  return (
    <div style={{ height: STACK_HEIGHT }} className="w-full">
      <LazyProductBlockScene
        segments={segments.map((segment) => ({
          id: segment.id,
          amountCents: segment.amountCents,
        }))}
        totalCents={totalCents}
        animate={animate}
      />
    </div>
  );
}
