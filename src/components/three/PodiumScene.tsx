"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { formatUsd } from "@/lib/pricing";
import { SceneBillboard } from "./SceneBillboard";
import { SceneFrame } from "./SceneFrame";

/**
 * The top three as 3D blocks, height proportional to money paid, crown on #1.
 *
 * Two deliberate choices:
 *
 * **Billboards are real DOM (`SceneBillboard`), not `<Text>`.** `<Text>` bakes
 * glyphs into the canvas texture, which makes rank, title and price invisible
 * to crawlers and screen readers. `SceneBillboard` mounts real DOM over the
 * block, so the text is selectable and readable by assistive tech. The
 * trade-off is that this DOM appears only after the client bundle runs, so it
 * is *not* in the server HTML — which is exactly why the 2D board is mandatory
 * rather than a fallback.
 *
 * **Block heights are square-rooted, not linear.** Money on this board spans two
 * orders of magnitude, so a linear scale makes the leader a wall and everyone
 * else a sliver. The square root keeps #2 and #3 visibly present while the
 * leader still clearly dominates; a floor keeps the shortest block readable as a
 * block rather than a plate.
 */

export type PodiumEntry = {
  id: string;
  slug: string;
  title: string;
  totalPaidCents: number;
};

/** Minimum and maximum block height, in world units. */
const MIN_HEIGHT = 0.85;
const MAX_HEIGHT = 3.6;

/** Horizontal spacing between block centres. */
const SPACING = 2.35;

/**
 * Where each rank stands, by rank rather than by slot.
 *
 * Keying off the rank — not the array position — is what keeps the layout right
 * on a short board. A board with only two paid listings still puts #1 in the
 * middle with #2 to its left, and a board with one puts the lone leader dead
 * centre, instead of silently drawing it wherever index 0 happens to fall.
 */
const SLOT_X: Record<number, number> = {
  1: 0,
  2: -SPACING,
  3: SPACING,
};

/** Extra z, towards the camera, for the winner. */
const WINNER_FORWARD = 0.55;

/**
 * Map money to block height.
 *
 * Falls back to a pleasant arrangement when every listing has paid the same
 * amount (or only one exists), because a range of zero would otherwise divide
 * by zero and collapse the podium.
 */
function heightFor(cents: number, min: number, max: number): number {
  if (max <= min) return (MIN_HEIGHT + MAX_HEIGHT) / 2;

  const normalised = (cents - min) / (max - min);
  const shaped = Math.sqrt(Math.max(0, normalised));

  return MIN_HEIGHT + shaped * (MAX_HEIGHT - MIN_HEIGHT);
}

/** A slowly turning crowned peak, drawn from primitives — no downloaded models. */
function Crown({ animated, y }: { animated: boolean; y: number }) {
  const group = useRef<import("three").Group>(null);

  useFrame((_, delta) => {
    if (!animated || !group.current) return;
    group.current.rotation.y += delta * 0.35;
  });

  return (
    <group ref={group} position={[0, y, 0]}>
      {/* The band. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.075, 12, 32]} />
        <meshStandardMaterial
          color="#f2c14e"
          metalness={0.95}
          roughness={0.24}
          emissive="#6b4a10"
          emissiveIntensity={0.5}
        />
      </mesh>
      {/* Four points around the band. */}
      {[0, 1, 2, 3].map((index) => {
        const angle = (index / 4) * Math.PI * 2;
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * 0.42, 0.19, Math.sin(angle) * 0.42]}
          >
            <coneGeometry args={[0.105, 0.34, 8]} />
            <meshStandardMaterial
              color="#ffd76e"
              metalness={0.9}
              roughness={0.2}
              emissive="#7a5510"
              emissiveIntensity={0.6}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Block({
  entry,
  rank,
  min,
  max,
  animated,
  showCrown,
}: {
  entry: PodiumEntry;
  rank: 1 | 2 | 3;
  min: number;
  max: number;
  animated: boolean;
  showCrown: boolean;
}) {
  const height = heightFor(entry.totalPaidCents, min, max);

  const palette =
    rank === 1
      ? { top: "#f2c14e", body: "#6b4a10", emissive: "#8a6412" }
      : rank === 2
        ? { top: "#cfd6e4", body: "#3b4252", emissive: "#2a3040" }
        : { top: "#b98cf0", body: "#4a2d7a", emissive: "#5a3a96" };

  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.75, height, 1.75]} />
        <meshStandardMaterial
          color={palette.body}
          metalness={rank === 1 ? 0.85 : 0.35}
          roughness={rank === 1 ? 0.28 : 0.55}
          emissive={palette.emissive}
          emissiveIntensity={0.35}
        />
      </mesh>

      {/* A lit cap so the top face reads as gold even at a shallow angle. */}
      <mesh position={[0, height + 0.015, 0]}>
        <boxGeometry args={[1.78, 0.03, 1.78]} />
        <meshStandardMaterial
          color={palette.top}
          metalness={0.9}
          roughness={0.22}
          emissive={palette.emissive}
          emissiveIntensity={0.7}
        />
      </mesh>

      {showCrown && <Crown animated={animated} y={height + 0.62} />}

      {/*
        The billboard. Offset above the block (plus the crown, when present) so
        it never intersects the geometry.
      */}
      <SceneBillboard
        position={[0, height + (showCrown ? 1.35 : 0.55), 0]}
        center
        distanceFactor={11}
        // Keeps the DOM out of the pointer path except where it is deliberately
        // interactive, and stops it swallowing clicks meant for the canvas.
        style={{ pointerEvents: "none" }}
        zIndexRange={[10, 0]}
      >
        <div className="w-44 select-none text-center">
          <span
            className="font-display text-[2.6rem] font-bold leading-none tabular-nums"
            style={{
              color: palette.top,
              textShadow: "0 2px 14px rgba(0,0,0,0.9)",
            }}
          >
            {rank}
          </span>
          <p
            className="mt-1 truncate text-[0.8rem] font-semibold text-ivory"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.95)" }}
          >
            {entry.title}
          </p>
          <p
            className="text-[0.72rem] font-semibold tabular-nums"
            style={{
              color: palette.top,
              textShadow: "0 2px 10px rgba(0,0,0,0.95)",
            }}
          >
            {formatUsd(entry.totalPaidCents)}
          </p>
        </div>
      </SceneBillboard>
    </group>
  );
}

/**
 * A slow ellipse drift plus mouse parallax.
 *
 * Both are motion, so both are switched off under reduced motion — the scene
 * still renders and still responds to nothing, which is the point.
 *
 * The camera comes off the frame callback rather than from `useThree()`. It is
 * the same object, but `useThree()`'s return value is a hook result, and moving
 * it is exactly what this scene is for: the camera is a three.js object the
 * renderer owns, and driving it from React state would re-render every frame —
 * the thing the frame loop exists to avoid.
 */
function CameraDrift({ animated }: { animated: boolean }) {
  const elapsed = useRef(0);

  useFrame((state, delta) => {
    if (!animated) return;
    elapsed.current += delta;

    const { camera } = state;
    const t = elapsed.current * 0.28;

    // Idle drift: a gentle sweep so the scene is alive without being busy.
    const driftX = Math.sin(t) * 0.42;
    const driftY = Math.sin(t * 0.7) * 0.16;

    // Parallax: pointer influence stays small so the horizon never tips.
    const parallaxX = state.pointer.x * 0.55;
    const parallaxY = state.pointer.y * 0.28;

    camera.position.x += (driftX + parallaxX - camera.position.x) * 0.045;
    camera.position.y +=
      (2.4 + driftY + parallaxY - camera.position.y) * 0.045;
    camera.lookAt(0, 1.5, 0);
  });

  return null;
}

export function PodiumScene({
  rows,
  moneyRange,
  animate,
}: {
  rows: PodiumEntry[];
  moneyRange: { min: number; max: number };
  animate: boolean;
}) {
  return (
    <SceneFrame cameraPosition={[0, 2.4, 8.5]}>
      <PodiumContents rows={rows} moneyRange={moneyRange} animate={animate} />
    </SceneFrame>
  );
}

/** The scene's contents, kept apart so the canvas frame stays a plain wrapper. */
function PodiumContents({
  rows,
  moneyRange,
  animate,
}: {
  rows: PodiumEntry[];
  moneyRange: { min: number; max: number };
  animate: boolean;
}) {
  /**
   * Rank is the array index plus one, so position derives from rank rather than
   * from how many entries happen to be present.
   */
  const slots = useMemo(
    () =>
      rows.slice(0, 3).map((entry, index) => {
        const rank = (index + 1) as 1 | 2 | 3;
        return {
          entry,
          rank,
          x: SLOT_X[rank],
          z: rank === 1 ? WINNER_FORWARD : 0,
        };
      }),
    [rows],
  );

  return (
    <>
      <CameraDrift animated={animate} />

      {slots.map(({ entry, rank, x, z }) => (
        <group key={entry.id} position={[x, 0, z]}>
          <Block
            entry={entry}
            rank={rank}
            min={moneyRange.min}
            max={moneyRange.max}
            animated={animate}
            showCrown={rank === 1}
          />
        </group>
      ))}

      {/* The plinth the blocks stand on, tying them into one object. */}
      <mesh position={[0, -0.14, 0]} receiveShadow>
        <boxGeometry args={[SPACING * 3 + 1.6, 0.28, 3]} />
        <meshStandardMaterial
          color="#15131f"
          metalness={0.5}
          roughness={0.6}
        />
      </mesh>
    </>
  );
}
