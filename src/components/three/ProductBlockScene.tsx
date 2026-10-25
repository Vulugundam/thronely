"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { formatUsd } from "@/lib/pricing";
import { SceneBillboard } from "./SceneBillboard";
import { SceneFrame } from "./SceneFrame";
import {
  MeshPhysicalMaterial,
  Color,
  ConeGeometry,
  SphereGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  BoxGeometry,
  TorusGeometry,
  RingGeometry,
  CylinderGeometry,
} from "three";

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

/** Each segment's dimensions, in world units. */
const SEGMENT_WIDTH = 1.7;
const SEGMENT_DEPTH = 1.7;

/** Premium tone configurations - gold and violet with physical materials */
const TONES = [
  {
    body: new Color("#6a4e08"),
    top: new Color("#f5c852"),
    side: new Color("#4a3606"),
    emissive: new Color("#2d1f04"),
    emissiveIntensity: 0.5,
    metalness: 0.9,
    roughness: 0.2,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    accent: "#f5c852",
    glow: "#ffd700",
    particleColor: "#ffd700",
  },
  {
    body: new Color("#34204c"),
    top: new Color("#c094fc"),
    side: new Color("#241438"),
    emissive: new Color("#140820"),
    emissiveIntensity: 0.55,
    metalness: 0.78,
    roughness: 0.26,
    clearcoat: 0.45,
    clearcoatRoughness: 0.14,
    accent: "#c094fc",
    glow: "#a077e8",
    particleColor: "#b88cfa",
  },
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
    <SceneFrame cameraPosition={[0, 1.3, 6.2]} enablePostProcessing={true}>
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [entranceProgress, setEntranceProgress] = useState(0);

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

  // Entrance animation
  useFrame(() => {
    if (entranceProgress < 1) {
      setEntranceProgress(p => Math.min(1, p + 0.02));
    }
  });

  useFrame((state) => {
    if (!animate || !group.current) return;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.15) * 0.22;
  });

  if (laid.length === 0) return null;

  return (
    <group
      ref={group}
      position={[0, -SCALE_HEIGHT / 2 + (1 - entranceProgress) * -1.5, 0]}
      scale={entranceProgress}
    >
      {laid.map(({ segment, index, height, y }) => {
        const tone = TONES[index % TONES.length];
        const isHovered = hoveredIndex === index;
        const share = totalCents > 0 ? segment.amountCents / totalCents : 0;

        return (
          <group
            key={segment.id}
            position={[0, y, 0]}
            onPointerOver={() => setHoveredIndex(index)}
            onPointerOut={() => setHoveredIndex(null)}
          >
            {/* Main segment body - slightly tapered */}
            <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[SEGMENT_WIDTH, height, SEGMENT_DEPTH]} />
              <meshPhysicalMaterial
                color={tone.body}
                metalness={tone.metalness}
                roughness={tone.roughness}
                clearcoat={tone.clearcoat}
                clearcoatRoughness={tone.clearcoatRoughness}
                emissive={tone.emissive}
                emissiveIntensity={tone.emissiveIntensity + (isHovered ? 0.35 : 0)}
                reflectivity={0.75}
              />
            </mesh>

            {/* Top face - distinct highlight material */}
            <mesh position={[0, height + 0.01, 0]}>
              <boxGeometry args={[SEGMENT_WIDTH + 0.02, 0.02, SEGMENT_DEPTH + 0.02]} />
              <meshPhysicalMaterial
                color={tone.top}
                metalness={0.98}
                roughness={0.05}
                clearcoat={1.0}
                clearcoatRoughness={0.02}
                emissive={tone.emissive}
                emissiveIntensity={1.2 + (isHovered ? 0.6 : 0)}
              />
            </mesh>

            {/* Side accent strips */}
            <mesh position={[SEGMENT_WIDTH / 2 + 0.005, height / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
              <boxGeometry args={[0.015, height * 0.95, SEGMENT_DEPTH * 0.92]} />
              <meshPhysicalMaterial
                color={tone.side}
                metalness={tone.metalness - 0.1}
                roughness={tone.roughness + 0.06}
                emissive={tone.emissive}
                emissiveIntensity={tone.emissiveIntensity * 0.8 + (isHovered ? 0.25 : 0)}
              />
            </mesh>
            <mesh position={[-SEGMENT_WIDTH / 2 - 0.005, height / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
              <boxGeometry args={[0.015, height * 0.95, SEGMENT_DEPTH * 0.92]} />
              <meshPhysicalMaterial
                color={tone.side}
                metalness={tone.metalness - 0.1}
                roughness={tone.roughness + 0.06}
                emissive={tone.emissive}
                emissiveIntensity={tone.emissiveIntensity * 0.8 + (isHovered ? 0.25 : 0)}
              />
            </mesh>
            <mesh position={[0, height / 2, SEGMENT_DEPTH / 2 + 0.005]}>
              <boxGeometry args={[SEGMENT_WIDTH * 0.92, height * 0.95, 0.015]} />
              <meshPhysicalMaterial
                color={tone.side}
                metalness={tone.metalness - 0.1}
                roughness={tone.roughness + 0.06}
                emissive={tone.emissive}
                emissiveIntensity={tone.emissiveIntensity * 0.8 + (isHovered ? 0.25 : 0)}
              />
            </mesh>
            <mesh position={[0, height / 2, -SEGMENT_DEPTH / 2 - 0.005]}>
              <boxGeometry args={[SEGMENT_WIDTH * 0.92, height * 0.95, 0.015]} />
              <meshPhysicalMaterial
                color={tone.side}
                metalness={tone.metalness - 0.1}
                roughness={tone.roughness + 0.06}
                emissive={tone.emissive}
                emissiveIntensity={tone.emissiveIntensity * 0.8 + (isHovered ? 0.25 : 0)}
              />
            </mesh>

            {/* Segment divider - thin glowing ring between segments */}
            {index < laid.length - 1 && (
              <mesh position={[0, height + 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[SEGMENT_WIDTH / 2 * 0.9, SEGMENT_WIDTH / 2 * 1.0, 8]} />
                <meshBasicMaterial
                  color={tone.glow}
                  transparent
                  opacity={0.7}
                  depthWrite={false}
                  blending={2}
                  side={2}
                />
              </mesh>
            )}

            {/* Floating particles for significant payments (>10% of total) */}
            {animate && share > 0.1 && (
              <SegmentParticles
                y={height / 2}
                color={tone.particleColor}
                height={height}
                hovered={isHovered}
                animate={animate}
              />
            )}

            {/* Subtle inner glow for large segments */}
            {share > 0.15 && (
              <mesh position={[0, height / 2, 0]} scale={[0.85, 0.9, 0.85]}>
                <boxGeometry args={[SEGMENT_WIDTH, height, SEGMENT_DEPTH]} />
                <meshBasicMaterial
                  color={tone.glow}
                  transparent
                  opacity={0.05}
                  depthWrite={false}
                  blending={2}
                />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Base platform with premium material */}
      <mesh position={[0, -0.15, 0]} receiveShadow>
        <cylinderGeometry args={[SEGMENT_WIDTH * 0.75, SEGMENT_WIDTH * 0.75, 0.2, 12]} />
        <meshPhysicalMaterial
          color="#12101a"
          metalness={0.55}
          roughness={0.38}
          clearcoat={0.3}
          clearcoatRoughness={0.22}
        />
      </mesh>

      {/* Subtle glow ring on base */}
      <mesh position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 1.1, 16]} />
        <meshBasicMaterial
          color="#3d2f08"
          transparent
          opacity={0.06}
          side={2}
          depthWrite={false}
        />
      </mesh>

      {/* The cumulative total, above the stack. */}
      <SceneBillboard
        position={[0, stackTop + 0.75, 0]}
        center
        distanceFactor={9}
        style={{ pointerEvents: "none" }}
        zIndexRange={[10, 0]}
      >
        <div className="w-44 text-center select-none">
          <p
            className="font-display text-xl font-bold text-gold-400 tabular-nums"
            style={{
              textShadow: `
                0 0 20px #ffd70090,
                0 2px 20px rgba(0,0,0,0.95),
                0 0 40px #ffd70050
              `,
              filter: "drop-shadow(0 0 20px #ffd70090)",
            }}
          >
            {formatUsd(totalCents)}
          </p>
          <p
            className="mt-1 text-[0.7rem] text-mist"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.95)" }}
          >
            {segments.length} payment{segments.length === 1 ? "" : "s"}
          </p>
        </div>
      </SceneBillboard>
    </group>
  );
}

/** Small particle burst effect for significant payments */
function SegmentParticles({
  y,
  color,
  height,
  hovered,
  animate,
}: {
  y: number;
  color: string;
  height: number;
  hovered: boolean;
  animate: boolean;
}) {
  const [particles] = useState(() => {
    const arr = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      arr.push({
        angle,
        radius: 0.0,
        maxRadius: 0.45 + Math.random() * 0.35,
        height: 0,
        maxHeight: 0.35 + Math.random() * 0.45,
        speed: 0.5 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        size: 0.02 + Math.random() * 0.025,
        opacity: 0.8,
        startDelay: Math.random() * 200,
        life: 1.0,
      });
    }
    return arr;
  });

  const elapsed = useRef(0);
  const [visible, setVisible] = useState(false);

  useFrame((state, delta) => {
    if (!animate) return;
    elapsed.current += delta * 1000; // ms

    if (elapsed.current > 100 && !visible) {
      setVisible(true);
    }
  });

  if (!visible) return null;

  return (
    <group position={[0, y, 0]}>
      {particles.map((p, i) => {
        const progress = Math.min(1, (elapsed.current - p.startDelay) / 1500);
        if (progress <= 0) return null;

        const radius = p.maxRadius * progress;
        const heightPos = p.maxHeight * progress * (2 - progress); // Up then down
        const opacity = p.opacity * (1 - progress);

        return (
          <mesh
            key={i}
            position={[
              Math.cos(p.angle) * radius,
              heightPos,
              Math.sin(p.angle) * radius,
            ]}
            scale={p.size * (1 - progress * 0.4)}
          >
            <icosahedronGeometry args={[1, 0]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={opacity}
              blending={2}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** Ambient particles around the stack */
function StackParticles({ animate }: { animate: boolean }) {
  const [particles] = useState(() => {
    const arr = [];
    for (let i = 0; i < 20; i++) {
      arr.push({
        angle: (i / 20) * Math.PI * 2,
        radius: 1.2 + Math.random() * 0.8,
        height: Math.random() * SCALE_HEIGHT * 0.8,
        speed: 0.05 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
        size: 0.01 + Math.random() * 0.02,
        color: Math.random() > 0.5 ? "#ffd700" : "#b88cfa",
        opacity: 0.15 + Math.random() * 0.2,
      });
    }
    return arr;
  });

  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!animate) return;
    elapsed.current += delta;
  });

  if (!animate) return null;

  return (
    <group>
      {particles.map((p, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(elapsed.current * p.speed + p.phase) * p.radius,
            p.height + Math.sin(elapsed.current * p.speed * 0.7 + p.phase) * 0.1,
            Math.sin(elapsed.current * p.speed + p.phase) * p.radius,
          ]}
          scale={p.size * (1 + Math.sin(elapsed.current + p.phase) * 0.3)}
          rotation={[elapsed.current * 0.08, elapsed.current * 0.12, 0]}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color={p.color}
            transparent
            opacity={p.opacity}
            blending={2}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}