"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { formatUsd } from "@/lib/pricing";
import { SceneBillboard } from "./SceneBillboard";
import { SceneFrame } from "./SceneFrame";

/**
 * A listing's payment history as a stack of 3D segments.
 *
 * Each segment is one real payment and its height is that payment's share of the
 * total. This is deliberately *not* a picture of historical rank: a true rank at
 * a past moment depends on every other listing's total at that instant, and
 * those snapshots were never stored, so drawing one would mean inventing it.
 * Cumulative money is real data, and it happens to be the thing that determines
 * rank today — which is why the stack is a fair portrait of how a listing got
 * where it is.
 *
 * Segments alternate gold/violet, matching the 2D twin exactly so the swap
 * between renderings reads as a change of medium rather than of meaning.
 */

export type PaymentSegment = {
  id: string;
  amountCents: number;
};

/** Total stack height for the tallest possible listing, in world units. */
const SCALE_HEIGHT = 3.4;

/** Each segment's height, in world units. */
const SEGMENT_WIDTH = 1.7;
const SEGMENT_DEPTH = 1.7;

const TONES = [
  { body: "#8a6412", emissive: "#c99a24", metalness: 0.85, roughness: 0.3 },
  { body: "#4a2d7a", emissive: "#7b52c4", metalness: 0.5, roughness: 0.45 },
] as const;

export function ProductBlockScene({
  segments,
  totalCents,
  animate,
}: {
  segments: PaymentSegment[];
  totalCents: number;
  animate: boolean;
}) {
  return (
    <SceneFrame cameraPosition={[0, 1.1, 6.4]}>
      <StackContents
        segments={segments}
        totalCents={totalCents}
        animate={animate}
      />
    </SceneFrame>
  );
}

/** The scene's contents, kept apart so the canvas frame stays a plain wrapper. */
function StackContents({
  segments,
  totalCents,
  animate,
}: {
  segments: PaymentSegment[];
  totalCents: number;
  animate: boolean;
}) {
  const group = useRef<Group>(null);

  /**
   * Lay the segments out bottom-up, each with a height proportional to its
   * share of the total.
   *
   * A floor on the segment height keeps a $5 payment on a $10,000 listing from
   * collapsing to nothing — but the floor is applied only to the drawn height,
   * never to the y-offset, so the stack still sums to exactly the total. Scaling
   * the offsets would make the picture disagree with the number above it.
   */
  const laid = useMemo(() => {
    if (totalCents <= 0 || segments.length === 0) return [];

    const minDrawn = SCALE_HEIGHT * 0.035;
    let cursor = 0;

    return segments.map((segment, index) => {
      const share = segment.amountCents / totalCents;
      const drawn = Math.max(share * SCALE_HEIGHT, minDrawn);
      const y = cursor + drawn / 2;
      cursor += drawn;

      return {
        segment,
        index,
        height: drawn,
        y,
      };
    });
  }, [segments, totalCents]);

  const stackTop = laid.length > 0 ? laid[laid.length - 1].y + laid[laid.length - 1].height / 2 : 0;

  useFrame((state) => {
    if (!animate || !group.current) return;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.22) * 0.34;
  });

  if (laid.length === 0) return null;

  return (
    <group ref={group} position={[0, -SCALE_HEIGHT / 2, 0]}>
      {laid.map(({ segment, index, height, y }) => {
        const tone = TONES[index % TONES.length];
        return (
          <mesh key={segment.id} position={[0, y, 0]}>
            <boxGeometry args={[SEGMENT_WIDTH, height, SEGMENT_DEPTH]} />
            <meshStandardMaterial
              color={tone.body}
              metalness={tone.metalness}
              roughness={tone.roughness}
              emissive={tone.emissive}
              emissiveIntensity={0.42}
            />
          </mesh>
        );
      })}

      {/* The cumulative total, above the stack. */}
      <SceneBillboard
        position={[0, stackTop + 0.5, 0]}
        center
        distanceFactor={9}
        style={{ pointerEvents: "none" }}
        zIndexRange={[10, 0]}
      >
        <div className="w-40 text-center select-none">
          <p
            className="font-display text-xl font-bold text-gold-400 tabular-nums"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.95)" }}
          >
            {formatUsd(totalCents)}
          </p>
          <p
            className="text-[0.68rem] text-mist"
            style={{ textShadow: "0 2px 8px rgba(0,0,0,0.95)" }}
          >
            {segments.length} payment{segments.length === 1 ? "" : "s"}
          </p>
        </div>
      </SceneBillboard>
    </group>
  );
}
